import { forwardRef, type SelectHTMLAttributes } from 'react';
import { CalendarDays, ChevronDown } from './icons';
interface Props extends SelectHTMLAttributes<HTMLSelectElement> {
  options: Array<{label: string; value: string | number}>;
  calendar?: boolean;
  fullWidth?: boolean;
  isDisabled?: boolean;
  isRequired?: boolean;
  isInvalid?: boolean;
}
export const FilterSelect = forwardRef<HTMLSelectElement, Props>(function FilterSelect({options, calendar, fullWidth, isDisabled, isRequired, isInvalid, className, ...props}, ref) {
  return <span className={'filter-select' + (calendar ? ' filter-select-calendar' : '') + (fullWidth ? ' filter-select-fullwidth' : '')}>{calendar && <CalendarDays size={16} aria-hidden />}<select ref={ref} {...props} disabled={isDisabled || props.disabled} required={isRequired || props.required} aria-invalid={isInvalid || undefined} className={'filter-native ' + (className ?? '')}>{options.map(option=><option key={option.value} value={option.value}>{option.label}</option>)}</select><ChevronDown size={14} className="filter-select-chevron" aria-hidden /></span>;
});
