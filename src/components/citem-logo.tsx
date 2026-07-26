type CitemLogoProps = {
  variant?: "compact" | "horizontal";
  className?: string;
  priority?: boolean;
};

export function CitemLogo({
  variant = "horizontal",
  className = "",
}: CitemLogoProps) {
  const compact = variant === "compact";

  return (
    <span className={`citem-logo citem-logo-${variant} ${className}`.trim()}>
      {/*
        Use the approved uploaded artwork directly. A version query prevents
        browsers from reusing the earlier hand-redrawn SVG from cache.
      */}
      <img
        src="/brand/citem-owl-mark.svg?v=approved-original-20260725"
        width={compact ? 52 : 48}
        height={compact ? 67 : 62}
        alt="CİTEM owl-eye logo"
        className="citem-logo-mark"
        style={compact ? { height: "3.6rem", width: "auto" } : undefined}
        decoding="async"
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
