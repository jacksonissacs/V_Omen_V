export function TabGroup({
  items,
  value,
  onChange,
  ranges,
}: {
  items: string[]
  value: string
  onChange: (value: string) => void
  ranges?: boolean
}) {
  return (
    <div className="aion-tabs" data-ranges={ranges}>
      {items.map((item) => (
        <button
          type="button"
          className="aion-tab"
          data-active={value === item}
          aria-pressed={value === item}
          key={item}
          onClick={() => onChange(item)}
        >
          {item}
        </button>
      ))}
    </div>
  )
}
