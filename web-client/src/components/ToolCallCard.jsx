/** One tool call Claude made while answering: name, input and result. */
export default function ToolCallCard({ call }) {
  return (
    <details className="tool-card">
      <summary>
        🔧 <code>{call.name}</code>
        {call.isError && <span className="badge-error">error</span>}
      </summary>
      <span className="section-label">Input</span>
      <pre>{JSON.stringify(call.input, null, 2)}</pre>
      <span className="section-label">Result</span>
      <pre>{call.output}</pre>
    </details>
  );
}
