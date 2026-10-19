/** A perforated ticket: the place in line on top, what to do next below the tear line. */
export function Ticket({
  top,
  bottom,
  tilted = false,
  wide = false,
}: {
  top: React.ReactNode;
  bottom: React.ReactNode;
  tilted?: boolean;
  wide?: boolean;
}) {
  return (
    <div className={`ticket${tilted ? " tilted" : ""}${wide ? " wide" : ""}`}>
      <div className="ticket-top">{top}</div>
      <div className="perf" aria-hidden="true" />
      <div className="ticket-bottom">{bottom}</div>
    </div>
  );
}
