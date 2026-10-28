import { Field, FieldDescription, FieldLabel } from '@/components/ui/field'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import type { Option } from '@/lib/interview-options'

interface SelectFieldProps<T extends string> {
  id: string
  label: string
  description?: string
  value: T
  onChange: (value: T) => void
  options: readonly Option<T>[]
}

// A labelled dropdown whose value type is the API's union (e.g. 'python' | 'java'),
// so a wrong value is a compile error, not a 422 at runtime.
export function SelectField<T extends string>({
  id,
  label,
  description,
  value,
  onChange,
  options,
}: SelectFieldProps<T>) {
  return (
    <Field>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Select
        items={options}
        value={value}
        onValueChange={(next) => {
          if (next !== null) onChange(next as T)
        }}
      >
        <SelectTrigger id={id} className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {description && <FieldDescription>{description}</FieldDescription>}
    </Field>
  )
}
