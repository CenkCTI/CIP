type CitemLogoProps = {
  variant?: "compact" | "horizontal";
  className?: string;
  priority?: boolean;
};

export function CitemLogo({
  variant = "horizontal",
  className = "",
  priority = false,
}: CitemLogoProps) {
  const compact = variant === "compact";

  return (
    <span className={`citem-logo citem-logo-${variant} ${className}`.trim()}>
      <img
        src="/brand/citem-owl-mark-original.png?v=original-20260726"
        width={compact ? 78 : 68}
        height={compact ? 52 : 45}
        alt=""
        aria-hidden="true"
        className="citem-logo-mark"
        style={compact ? { height: "3.6rem", width: "auto" } : undefined}
        decoding="async"
        loading={priority ? "eager" : "lazy"}
        fetchPriority={priority ? "high" : "auto"}
      />
      {!compact && (
        <span className="citem-logo-copy">
          <span className="citem-wordmark block">CİTEM</span>
          <span className="citem-brand-kicker block">BAYKUSH / CYBER INTELLIGENCE</span>
        </span>
      )}
    </span>
  );
}
