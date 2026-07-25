import Image from "next/image";

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
      <Image
        src="/brand/citem-owl-mark.svg"
        width={compact ? 52 : 48}
        height={compact ? 67 : 62}
        alt="CİTEM half-owl eye logo"
        className="citem-logo-mark"
        style={compact ? { height: "3.6rem", width: "auto" } : undefined}
        priority={priority}
        unoptimized
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
