import { useState } from 'react';
import { TrendingUp } from 'lucide-react';
import type { Session } from '../lib/types';
import { useI18n } from '../lib/i18n';
import { dateLabel, money, monthlyIncome } from '../lib/dates';
export function IncomeChart({ sessions, year, onYear, compact = false }: { sessions: Session[]; year: number; onYear?: (year: number) => void; compact?: boolean }) {
  const { language, t } = useI18n(); const values = monthlyIncome(sessions, year); const [selected, setSelected] = useState(new Date().getMonth());
  const maximum = Math.max(...values, 10000);
  const yearOptions = [...new Set([new Date().getFullYear(), year, ...sessions.map(s => Number((s.paidAt || s.date).slice(0, 4)))])].sort((a, b) => b - a);
  return <section className={`card income-chart ${compact ? 'chart-compact' : ''}`}><div className="section-heading"><div><h2><TrendingUp size={18}/>{t('incomeChart')}</h2><p>{t('incomeChartHint')}</p></div>{onYear && <label className="year-select"><span className="sr-only">{t('year')}</span><select value={year} onChange={e => onYear(Number(e.target.value))}>{yearOptions.map(y => <option key={y}>{y}</option>)}</select></label>}</div>
    <div className="chart-value"><strong>{money(values[selected], language)}</strong><span>{dateLabel(`${year}-${String(selected + 1).padStart(2, '0')}-01`, language, { month: 'long', year: 'numeric' })}</span></div>
    <div className="chart-area"><div className="chart-grid" aria-hidden="true"><span>{money(maximum, language)}</span><span>{money(maximum / 2, language)}</span><span>0 €</span></div><div className="chart-bars" role="group" aria-label={t('incomeChart')}>{values.map((value, index) => {
      const label = dateLabel(`${year}-${String(index + 1).padStart(2, '0')}-01`, language, { month: 'short' }).replace('.', '');
      return <button key={index} className={`chart-column ${index === selected ? 'is-selected' : ''}`} aria-pressed={index === selected} aria-label={`${label}: ${money(value, language)}`} title={`${label}: ${money(value, language)}`} onClick={() => setSelected(index)}><span className="bar-track"><span className="bar" style={{ height: `${Math.max(value ? 3 : 1, value / maximum * 100)}%` }}/></span><span className="bar-label">{label}</span></button>;
    })}</div></div>
  </section>;
}
