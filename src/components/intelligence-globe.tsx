import styles from "./intelligence-globe.module.css";

export function IntelligenceGlobe() {
  return (
    <div
      className={styles.scene}
      role="img"
      aria-label="Animated world globe showing cyber intelligence data flows"
    >
      <div className={styles.ambientGlow} aria-hidden="true" />
      <svg
        className={styles.visual}
        viewBox="0 0 520 520"
        aria-hidden="true"
        focusable="false"
      >
        <defs>
          <radialGradient id="citem-globe-fill" cx="42%" cy="34%" r="68%">
            <stop offset="0%" stopColor="#263321" />
            <stop offset="70%" stopColor="#182118" />
            <stop offset="100%" stopColor="#111713" />
          </radialGradient>
          <linearGradient id="citem-route" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#6f9b79" stopOpacity="0.16" />
            <stop offset="48%" stopColor="#d4a958" stopOpacity="0.9" />
            <stop offset="100%" stopColor="#b9822f" stopOpacity="0.18" />
          </linearGradient>
          <filter id="citem-node-glow" x="-200%" y="-200%" width="400%" height="400%">
            <feGaussianBlur stdDeviation="4" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <clipPath id="citem-globe-clip">
            <circle cx="260" cy="260" r="150" />
          </clipPath>
        </defs>

        <g className={styles.orbits}>
          <circle cx="260" cy="260" r="224" />
          <circle cx="260" cy="260" r="198" />
          <ellipse cx="260" cy="260" rx="238" ry="122" transform="rotate(-18 260 260)" />
        </g>

        <g className={styles.globe}>
          <circle className={styles.globeShadow} cx="260" cy="260" r="158" />
          <circle className={styles.globeBody} cx="260" cy="260" r="150" />

          <g className={styles.grid} clipPath="url(#citem-globe-clip)">
            <ellipse cx="260" cy="260" rx="56" ry="150" />
            <ellipse cx="260" cy="260" rx="104" ry="150" />
            <ellipse cx="260" cy="260" rx="150" ry="52" />
            <ellipse cx="260" cy="260" rx="150" ry="104" />
            <path d="M110 260H410" />
            <path d="M260 110V410" />
          </g>

          <g className={styles.land} clipPath="url(#citem-globe-clip)">
            <path d="M151 187l22-28 38-18 31 7 9 23-17 18-25-3-14 18-29 8-21-7z" />
            <path d="M214 224l25 8 15 24-4 31-18 26-15 45-18-19 6-38-15-27 5-30z" />
            <path d="M274 155l30-15 43 12 28 24-10 22-31 6-18 22-29-9-28 8-17-20 12-25z" />
            <path d="M299 230l31 5 20 27-7 38-22 28-17-12-9-31-22-20 5-24z" />
            <path d="M362 320l23-8 18 16-6 18-28 6-17-13z" />
            <path d="M128 245l19-7 13 12-7 15-25 2-10-11z" />
          </g>

          <g className={styles.routes}>
            <path id="route-a" d="M150 246C198 165 304 160 373 225" />
            <path id="route-b" d="M170 319C231 365 327 355 381 286" />
            <path id="route-c" d="M201 182C247 237 298 290 344 336" />
            <path id="route-d" d="M144 277C211 246 309 244 392 265" />
          </g>

          <g className={styles.nodes}>
            <circle cx="150" cy="246" r="5" />
            <circle cx="373" cy="225" r="5" />
            <circle cx="170" cy="319" r="4" />
            <circle cx="381" cy="286" r="5" />
            <circle cx="201" cy="182" r="4" />
            <circle cx="344" cy="336" r="5" />
            <circle cx="268" cy="252" r="6" />
          </g>

          <g className={styles.packets} filter="url(#citem-node-glow)">
            <circle r="3.4">
              <animateMotion dur="5.8s" repeatCount="indefinite" path="M150 246C198 165 304 160 373 225" />
            </circle>
            <circle r="3" opacity="0.78">
              <animateMotion dur="7.2s" begin="-2.4s" repeatCount="indefinite" path="M170 319C231 365 327 355 381 286" />
            </circle>
            <circle r="2.8" opacity="0.72">
              <animateMotion dur="6.4s" begin="-4s" repeatCount="indefinite" path="M201 182C247 237 298 290 344 336" />
            </circle>
          </g>
        </g>

        <g className={styles.telemetry}>
          <circle cx="60" cy="260" r="4" />
          <circle cx="436" cy="174" r="3" />
          <circle cx="418" cy="390" r="4" />
          <path d="M64 260h37" />
          <path d="M411 176l-25 15" />
          <path d="M414 387l-31-14" />
        </g>
      </svg>
      <div className={styles.caption} aria-hidden="true">
        <span>GLOBAL SIGNAL FLOW</span>
        <span className={styles.liveIndicator}>LIVE</span>
      </div>
    </div>
  );
}
