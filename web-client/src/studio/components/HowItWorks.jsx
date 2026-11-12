export default function HowItWorks({ text }) {
  const wide = typeof window !== "undefined" && window.innerWidth >= 900;
  return (
    <details className="panel how" open={wide}>
      <summary>How it works</summary>
      <p>{text}</p>
    </details>
  );
}
