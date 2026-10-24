import test from 'node:test';
import assert from 'node:assert/strict';
import de from '../src/locales/de.json';
import uk from '../src/locales/uk.json';
import { findGuideTopics, guideGroups, guideTopics } from '../src/lib/guide';
import { moreNavigation, mainNavigation, isMoreRoute } from '../src/lib/navigation';

test('the guide is a secondary destination and every topic has usable instructions in both languages', () => {
  assert.equal(mainNavigation.length, 5); assert.ok(moreNavigation.some(item => item.id === 'guide')); assert.equal(isMoreRoute('guide'), true);
  assert.equal(new Set(guideTopics.map(topic => topic.id)).size, guideTopics.length);
  for (const topic of guideTopics) {
    assert.ok(guideGroups.some(group => group.id === topic.group));
    for (const words of [de, uk]) {
      for (const key of [topic.title, topic.summary, topic.steps, topic.tip, ...topic.actions.map(action => action.label)]) assert.ok(words[key].trim(), key);
      assert.ok(words[topic.steps].split('\n').length >= 3, topic.id);
    }
  }
});
test('guide search finds everyday tasks regardless of case and keeps both languages available', () => {
  assert.ok(findGuideTopics('URLAUB').some(topic => topic.id === 'appointments'));
  assert.ok(findGuideTopics('відпустка').some(topic => topic.id === 'appointments'));
  assert.ok(findGuideTopics('Rechnung грив').some(topic => topic.id === 'payments'));
  assert.ok(findGuideTopics('RÜCKLÄUFE').some(topic => topic.id === 'documents'));
  assert.deepEqual(findGuideTopics('iPad Sicherung').map(topic => topic.id), ['backups']);
});
test('guide search requires every word, handles empty input and never searches client records', () => {
  assert.equal(findGuideTopics('  ').length, guideTopics.length);
  assert.deepEqual(findGuideTopics('Urlaub Rechnungen'), []);
  assert.deepEqual(findGuideTopics('Alex von Beispiel'), []);
  assert.deepEqual(findGuideTopics('qzxvUnbekannt'), []);
});
test('guide shortcuts point to existing areas and settings rather than performing data actions', () => {
  const destinations = new Set([...mainNavigation, ...moreNavigation].map(item => item.id));
  for (const topic of guideTopics) for (const action of topic.actions) {
    assert.ok(destinations.has(action.target.route));
    if (action.target.route === 'settings') assert.ok(['practice', 'banks', 'backup', 'cloud', 'reminders', 'appearance', 'security'].includes(action.target.section));
    if ('waitlist' in action.target) assert.equal(action.target.route, 'appointments');
  }
});
