/** LED digits with faint unlit "8" segments behind each lit digit. */
function Led({ value, tone }: { value: number; tone: "dim" | "bright" }) {
  const cells = String(value).split("");
  return (
    <div className={`led ${tone}`} aria-hidden="true">
      {cells.map((c, i) => (
        <span key={i} className="cell">
          <span className="ghost">8</span>
          <span className="lit">{c}</span>
        </span>
      ))}
    </div>
  );
}

/**
 * A take-a-number machine: how many people are in line, the visitor's number,
 * and a printed ticket coming out of the slot.
 */
export function QueueMachine({
  name,
  inLine,
  yourNumber,
  yourLabel,
  ticketNote,
  ticketFoot,
  bump,
}: {
  name: string;
  inLine: number;
  yourNumber: number;
  yourLabel: string;
  ticketNote: string;
  ticketFoot: React.ReactNode;
  bump: number;
}) {
  return (
    <figure
      className="machine"
      aria-label={`${inLine} people in line. ${yourLabel}: number ${yourNumber}.`}
    >
      <div className="machine-body">
        <span className="screw tl" />
        <span className="screw tr" />
        <span className="screw bl" />
        <span className="screw br" />
        <div className="machine-top">
          <span>{(name || "Early access").toUpperCase()} · WAITLIST</span>
          <span className="status">
            <i />
            {ticketNote}
          </span>
        </div>
        <div className="screens">
          <div className="screen">
            <small>IN LINE</small>
            <Led value={inLine} tone="dim" />
          </div>
          <div className="screen wide">
            <small>{yourLabel.toUpperCase()}</small>
            <Led value={yourNumber} tone="bright" />
          </div>
        </div>
        <div className="slot" />
      </div>
      <div className="printed">
        <div className="printed-head">
          <span>{(name ? `${name} early access` : "Early access").toUpperCase()}</span>
          <span>ADMIT ONE</span>
        </div>
        <b>No. {yourNumber}</b>
        <div className="printed-perf" />
        <p>
          <span>
            Each friend: <strong>jump {bump} places</strong>
          </span>
          <span>{ticketFoot}</span>
        </p>
      </div>
    </figure>
  );
}
