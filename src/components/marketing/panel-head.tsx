interface PanelHeadProps {
  kicker: string
  title: string
  chip: string
}

export function PanelHead({ kicker, title, chip }: PanelHeadProps) {
  return (
    <div className="panel-head">
      <b>{kicker}</b>
      <span>{title}</span>
      <span className="chip demo">{chip}</span>
    </div>
  )
}
