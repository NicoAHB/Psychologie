/* Private Google Apps Script. Run setupPraxisraum once, then deploy as Web App:
 * execute as yourself, access Anyone. The URL alone never permits sending.
 * No Gmail inbox access, tracking, patient database or automatic triggers.
 */
function setupPraxisraum() {
  var key = '__PRAXISRAUM_CONNECTION_KEY__';
  if (!/^gmail_[0-9a-f]{64}$/.test(key)) throw new Error('Generate the connection code in Praxisraum first.');
  PropertiesService.getScriptProperties().setProperty('PRAXISRAUM_KEY', key);
  MailApp.getRemainingDailyQuota(); // Triggers the one-time permission to send email.
}
function doPost(event) {
  var output = function (value) { return ContentService.createTextOutput(JSON.stringify(value)).setMimeType(ContentService.MimeType.JSON); };
  var fail = function (code) { return output({ ok: false, error: code }); };
  try {
    var secret = PropertiesService.getScriptProperties().getProperty('PRAXISRAUM_KEY');
    if (!secret || !event || !event.postData || event.postData.contents.length > 15000000) return fail('emailGmailConnectionInvalid');
    var envelope = JSON.parse(event.postData.contents);
    if (typeof envelope.timestamp !== 'number' || Math.abs(Date.now() - envelope.timestamp) > 300000
      || typeof envelope.payload !== 'string' || typeof envelope.signature !== 'string' || !/^[0-9a-f]{64}$/.test(envelope.signature)) return fail('emailGmailConnectionInvalid');
    var hex = function (bytes) { return bytes.map(function (b) { return ('0' + ((b + 256) % 256).toString(16)).slice(-2); }).join(''); };
    var expected = hex(Utilities.computeHmacSha256Signature(envelope.timestamp + '.' + envelope.payload, secret, Utilities.Charset.UTF_8));
    var mismatch = 0;
    for (var i = 0; i < expected.length; i++) mismatch |= expected.charCodeAt(i) ^ envelope.signature.charCodeAt(i);
    if (mismatch) return fail('emailGmailConnectionInvalid');
    var message = JSON.parse(envelope.payload);
    var accountEmail = Session.getEffectiveUser().getEmail().toLowerCase();
    if (!accountEmail || message.senderEmail !== accountEmail) return fail('emailGmailAddressMismatch');
    if (message.version !== 1 || ['check', 'send'].indexOf(message.action) < 0 || typeof message.senderName !== 'string'
      || message.senderName.length > 100 || /[\r\n\x00-\x1f<>]/.test(message.senderName)) return fail('emailGmailConnectionInvalid');
    if (message.action === 'check') return output({ ok: true, accountEmail: accountEmail });
    if (typeof message.requestId !== 'string' || !/^[A-Za-z0-9/._-]{1,180}$/.test(message.requestId)
      || typeof message.to !== 'string' || message.to.length > 254 || !/^[^\s@<>;,]+@[^\s@<>;,]+\.[^\s@<>;,]+$/.test(message.to)
      || typeof message.subject !== 'string' || !message.subject.trim() || message.subject.length > 180 || /[\r\n]/.test(message.subject)
      || typeof message.text !== 'string' || message.text.length > 12000 || !Array.isArray(message.attachments) || message.attachments.length > 1) return fail('emailGmailConnectionInvalid');
    var attachments = message.attachments.map(function (file) {
      var allowed = ['application/pdf','image/png','image/jpeg','image/webp','text/plain','text/calendar','application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/vnd.oasis.opendocument.text'];
      if (typeof file.filename !== 'string' || !file.filename || file.filename.length > 180 || /[\r\n\x00-\x1f/\\]/.test(file.filename)
        || allowed.indexOf(file.content_type) < 0 || typeof file.content !== 'string' || !/^[A-Za-z0-9+/]+={0,2}$/.test(file.content) || file.content.length % 4) throw new Error('invalid');
      var bytes = Utilities.base64Decode(file.content);
      if (!bytes.length || bytes.length > 10 * 1024 * 1024) throw new Error('invalid');
      return Utilities.newBlob(bytes, file.content_type, file.filename);
    });
    var hash = hex(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, JSON.stringify(message), Utilities.Charset.UTF_8));
    var recordKey = 'mail_' + hex(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, message.requestId, Utilities.Charset.UTF_8));
    var lock = LockService.getScriptLock();
    if (!lock.tryLock(5000)) return fail('emailGmailDeliveryUnknown');
    var properties = PropertiesService.getScriptProperties();
    try {
      var now = Date.now();
      if (now - Number(properties.getProperty('cleanup_at') || 0) > 86400000) {
        var all = properties.getProperties();
        Object.keys(all).forEach(function (key) {
          if (key.indexOf('mail_') === 0) {
            var item = JSON.parse(all[key]);
            if (item.status === 'accepted' && now - item.at > 7 * 86400000) properties.deleteProperty(key);
          }
        });
        properties.setProperty('cleanup_at', String(now));
      }
      var previous = properties.getProperty(recordKey);
      if (previous) {
        var record = JSON.parse(previous);
        if (record.hash !== hash) return fail('emailGmailDeliveryUnknown');
        if (record.status === 'accepted') return output({ ok: true, providerId: 'gmail/' + message.requestId, acceptedAt: record.acceptedAt });
        return fail('emailGmailDeliveryUnknown'); // Never repeat an uncertain send.
      }
      if (MailApp.getRemainingDailyQuota() < 1) return fail('emailRateLimited');
      properties.setProperty(recordKey, JSON.stringify({ status: 'sending', hash: hash, at: now }));
    } finally { lock.releaseLock(); }
    // The durable claim is stored BEFORE calling Google. If execution stops,
    // that request stays uncertain, including a crash after actual acceptance.
    try { MailApp.sendEmail({ to: message.to, subject: message.subject, body: message.text, name: message.senderName, attachments: attachments }); }
    catch (error) { return fail('emailGmailDeliveryUnknown'); }
    var acceptedAt = new Date().toISOString();
    properties.setProperty(recordKey, JSON.stringify({ status: 'accepted', hash: hash, at: Date.now(), acceptedAt: acceptedAt }));
    return output({ ok: true, providerId: 'gmail/' + message.requestId, acceptedAt: acceptedAt });
  } catch (error) { return fail('emailGmailDeliveryUnknown'); }
}
