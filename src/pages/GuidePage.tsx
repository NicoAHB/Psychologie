import { useMemo, useState } from 'react';
import { ArrowRight, BookOpen, ChevronDown, Lightbulb } from 'lucide-react';
import { findGuideTopics, guideGroups, type GuideDestination } from '../lib/guide';
import { useI18n } from '../lib/i18n';
import { Field, PageHeading } from '../components/ui';
import '../guide.css';

export function GuidePage({ onOpen }: { onOpen: (target: GuideDestination) => void }) {
  const { t } = useI18n();
  const [flowOpen, setFlowOpen] = useState(false);
  const [query, setQuery] = useState(''), [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());
  const topics = useMemo(() => findGuideTopics(query), [query]);
  const groups = guideGroups.filter(group => topics.some(topic => topic.group === group.id));
  const allOpen = topics.length > 0 && topics.every(topic => expanded.has(topic.id));
  function search(value: string) {
    setQuery(value); setExpanded(new Set(value.trim() ? findGuideTopics(value).map(topic => topic.id) : []));
  }
  function toggle(id: string) {
    setExpanded(previous => { const next = new Set(previous); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  }
  return <div className="guide-page"><PageHeading title={t('guide')} subtitle={t('guideSubtitle')}/>
    <section className="card guide-start" aria-labelledby="guide-start-title">
      <h2 id="guide-start-title"><button type="button" className="guide-topic-toggle" aria-label={t('guideFlowTitle')} aria-describedby="guide-flow-preview" aria-expanded={flowOpen} aria-controls="guide-flow-details" onClick={() => setFlowOpen(open => !open)}>
        <span><span className="eyebrow"><BookOpen size={16} aria-hidden="true"/>{t('guideStartLabel')}</span><span className="guide-start-title">{t('guideFlowTitle')}</span>
          <span id="guide-flow-preview" className="guide-topic-summary">{(['Appointment', 'Completion', 'Payment'] as const).map(step => t(`guideFlow${step}Title`)).join(' → ')}</span></span><ChevronDown size={20} aria-hidden="true"/>
      </button></h2>
      <div id="guide-flow-details" className="guide-topic-body" hidden={!flowOpen}><p>{t('guideFlowIntro')}</p>
      <ol className="guide-flow" role="list">{(['Appointment', 'Completion', 'Payment'] as const).map((step, index) => <li key={step}>
        <span className="guide-number" aria-hidden="true">{index + 1}</span><div><h3>{t(`guideFlow${step}Title`)}</h3><p>{t(`guideFlow${step}Text`)}</p></div>
      </li>)}</ol>
      <button type="button" className="btn btn-primary" onClick={() => onOpen({ route: 'overview' })}>{t('guideTodayAction')}<ArrowRight size={17} aria-hidden="true"/></button>
      </div>
    </section>
    <section className="card guide-find" aria-labelledby="guide-find-title"><h2 id="guide-find-title">{t('guideFindTitle')}</h2><p>{t('guideFindHint')}</p>
      <div className="guide-search"><Field label={t('guideSearch')} hint={t('guideSearchHint')}><input type="search" autoComplete="off" value={query} maxLength={120} placeholder={t('guideSearchPlaceholder')} onChange={event => search(event.target.value)}/></Field>
        {query && <button type="button" className="btn btn-secondary" onClick={() => search('')}>{t('guideSearchClear')}</button>}</div>
      {!!groups.length && <nav className="guide-jumps" aria-label={t('guideSections')}>{groups.map(group => <button key={group.id} type="button" className="btn btn-secondary" onClick={() => {
        const heading = document.getElementById(`guide-group-${group.id}`); heading?.focus({ preventScroll: true }); heading?.scrollIntoView({ block: 'start' });
      }}>{t(group.title)}</button>)}</nav>}
      <div className="guide-tools"><p className="hint" role="status" aria-live="polite">{t('guideResults').replace('{count}', String(topics.length))}</p>
        <button type="button" className="text-link" disabled={!topics.length} onClick={() => setExpanded(allOpen ? new Set() : new Set(topics.map(topic => topic.id)))}>{t(allOpen ? 'guideCollapseAll' : 'guideExpandAll')}</button></div>
    </section>
    {!topics.length && <section className="card guide-empty"><h2>{t('guideEmptyTitle')}</h2><p>{t('guideEmptyText')}</p></section>}
    {groups.map(group => <section key={group.id} className="guide-group" aria-labelledby={`guide-group-${group.id}`}>
      <h2 id={`guide-group-${group.id}`} tabIndex={-1}>{t(group.title)}</h2>
      {topics.filter(topic => topic.group === group.id).map(topic => <section key={topic.id} className="card guide-topic" aria-labelledby={`guide-title-${topic.id}`}>
        <h3 id={`guide-title-${topic.id}`}><button type="button" className="guide-topic-toggle" aria-label={t(topic.title)} aria-describedby={`guide-description-${topic.id}`} aria-expanded={expanded.has(topic.id)} aria-controls={`guide-body-${topic.id}`} onClick={() => toggle(topic.id)}>
          <span><span className="guide-topic-title">{t(topic.title)}</span><span id={`guide-description-${topic.id}`} className="guide-topic-summary">{t(topic.summary)}</span></span><ChevronDown size={20} aria-hidden="true"/>
        </button></h3>
        <div id={`guide-body-${topic.id}`} className="guide-topic-body" hidden={!expanded.has(topic.id)}>
          <ol className="guide-steps">{t(topic.steps).split('\n').filter(Boolean).map((step, index) => <li key={index}>{step}</li>)}</ol>
          <p className="guide-tip"><Lightbulb size={18} aria-hidden="true"/><span>{t(topic.tip)}</span></p>
          <div className="button-row guide-actions">{topic.actions.map(action => <button type="button" className="btn btn-secondary" key={action.label} onClick={() => onOpen(action.target)}>{t(action.label)}<ArrowRight size={16} aria-hidden="true"/></button>)}</div>
        </div>
      </section>)}
    </section>)}
  </div>;
}
