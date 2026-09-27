import { useId } from 'react';
import { useAppStrings } from '../../../../locales/appStrings';
import { choiceOptions, commitChoice, showChoice } from './phase1ChoiceFields.js';

/**
 * Ô chọn: danh sách gợi ý hoặc gõ giá trị khác (datalist).
 */
export default function Phase1ChoiceInput({
  fieldKey,
  value,
  onChange,
  className,
  autoFocus = false,
  disabled = false,
  placeholder,
}) {
  const { t } = useAppStrings();
  const listId = useId();
  const options = choiceOptions(fieldKey);
  if (!options) {
    return (
      <input
        className={className}
        value={value ?? ''}
        disabled={disabled}
        autoFocus={autoFocus}
        placeholder={placeholder}
        onClick={(e) => e.stopPropagation()}
        onChange={(e) => onChange(e.target.value)}
      />
    );
  }
  return (
    <>
      <input
        className={className}
        list={listId}
        value={showChoice(fieldKey, value, t)}
        disabled={disabled}
        autoFocus={autoFocus}
        placeholder={placeholder || t('workspace.phase1ChoiceHint')}
        onClick={(e) => e.stopPropagation()}
        onChange={(e) => onChange(commitChoice(fieldKey, e.target.value, t))}
      />
      <datalist id={listId}>
        {options.map((option) => {
          const label = option.labelKey ? t(option.labelKey) : option.value;
          return <option key={option.value} value={label} />;
        })}
      </datalist>
    </>
  );
}
