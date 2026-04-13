const BARS = [
  { y: 2, h: 22, color: "#2563eb" },  
  { y: 8, h: 16, color: "#0d9488" },  
  { y: 4, h: 20, color: "#7c3aed" },  
  { y: 11, h: 13, color: "#d97706" }, 
  { y: 14, h: 10, color: "#8cbf6e" }, 
  { y: 17, h: 7, color: "#e11d48" },  
];

interface ConductorLogoProps {
  size?: number;
  showWordmark?: boolean;
  className?: string;
}

export function ConductorLogo({ size = 24, showWordmark = false, className }: ConductorLogoProps) {
  return (
    <div className={`flex items-center gap-3 ${className || ""}`}>
      <svg
        width={size * (30 / 24)}
        height={size}
        viewBox="0 0 30 24"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-label="Conductor logo"
      >
        {BARS.map((bar, i) => (
          <rect
            key={i}
            x={i * 5.4}
            y={bar.y}
            width={3}
            height={bar.h}
            rx={1.5}
            fill={bar.color}
          />
        ))}
      </svg>
      {showWordmark && (
        <span
          className="font-semibold text-[var(--text-primary)] tracking-tight"
          style={{ fontSize: size * 0.9 }}
        >
          Conductor
        </span>
      )}
    </div>
  );
}
