/** The RepoVerse mark: a repository node with its module ring. */
export function RepoVerseMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden focusable="false">
      <g fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" opacity="0.55">
        <path d="M16 6.5 L25 12 L16 17.5 L7 12 Z" />
        <path d="M7 12 V20 L16 25.5 L25 20 V12" />
        <path d="M16 17.5 V25.5" />
      </g>
      <circle cx="16" cy="6.5" r="2.4" fill="hsl(var(--n-repository))" />
      <circle cx="25" cy="20" r="2" fill="hsl(var(--n-interface))" />
      <circle cx="7" cy="20" r="2" fill="hsl(var(--n-package))" />
      <circle cx="16" cy="17.5" r="1.8" fill="hsl(var(--c-accent))" />
    </svg>
  );
}
