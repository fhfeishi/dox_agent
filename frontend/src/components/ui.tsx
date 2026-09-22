import type { ReactNode } from "react";
import { Icon, type IconName } from "./Icons";

export type Tone = "mint" | "peach" | "lav" | "sky" | "rose" | "gray" | "yellow";

export const TONE_BG: Record<Tone, string> = {
  mint: "bg-[var(--tint-mint)] text-[#0e7a28]",
  peach: "bg-[var(--tint-peach)] text-[#8a3d00]",
  lav: "bg-[var(--tint-lavender)] text-[#4a2a8f]",
  sky: "bg-[var(--tint-sky)] text-[#12609e]",
  rose: "bg-[var(--tint-rose)] text-[#a02e6d]",
  gray: "bg-[var(--tint-gray)] text-[var(--slate)]",
  yellow: "bg-[var(--tint-yellow)] text-[#8a6a00]",
};

/* ---------------------------------------------------------------- Pill */

export function Pill({ tone = "gray", children }: { tone?: Tone; children: ReactNode }) {
  return (
    <span
      className={`inline-block rounded-[4px] px-[7px] py-[2px] text-[10.5px] leading-[1.45] font-semibold ${TONE_BG[tone]}`}
    >
      {children}
    </span>
  );
}

/* --------------------------------------------------------------- Button */

type ButtonVariant = "primary" | "outline" | "ghost" | "solid" | "quiet";

const BUTTON: Record<ButtonVariant, string> = {
  primary:
    "bg-[var(--primary)] text-white hover:bg-[var(--primary-pressed)] border border-transparent",
  solid:
    "bg-[var(--primary)] text-white hover:bg-[var(--primary-pressed)] border border-transparent",
  outline:
    "bg-[var(--canvas)] text-[var(--ink)] border border-[var(--hairline-strong)] hover:bg-[var(--surface)]",
  ghost:
    "bg-transparent text-[var(--slate)] border border-transparent hover:bg-[var(--surface)]",
  quiet:
    "bg-transparent text-[var(--slate)] border border-[var(--hairline)] hover:border-[var(--hairline-strong)] hover:text-[var(--charcoal)]",
};

export function Button({
  variant = "outline",
  size = "md",
  icon,
  iconSize = 14,
  className = "",
  children,
  onClick,
  disabled,
  title,
  type = "button",
}: {
  variant?: ButtonVariant;
  size?: "sm" | "md" | "lg";
  icon?: IconName;
  iconSize?: number;
  className?: string;
  children?: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  title?: string;
  type?: "button" | "submit";
}) {
  const sizeCls =
    size === "sm"
      ? "h-[26px] px-[10px] text-[12px]"
      : size === "lg"
        ? "h-[38px] px-[16px] text-[13.5px] w-full justify-center"
        : "h-[30px] px-[12px] text-[12.5px]";

  return (
    <button
      type={type}
      title={title}
      disabled={disabled}
      onClick={onClick}
      className={`font-app inline-flex shrink-0 items-center gap-[6px] rounded-[6px] font-medium whitespace-nowrap transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${BUTTON[variant]} ${sizeCls} ${className}`}
    >
      {icon ? <Icon name={icon} size={iconSize} /> : null}
      {children}
    </button>
  );
}

/* ----------------------------------------------------------- ToolButton */

export function ToolButton({
  icon,
  label,
  active,
  onClick,
  title,
  iconSize = 15,
}: {
  icon: IconName;
  label?: string;
  active?: boolean;
  onClick?: () => void;
  title?: string;
  iconSize?: number;
}) {
  return (
    <button
      type="button"
      title={title ?? label}
      onClick={onClick}
      className={`font-app inline-flex h-[30px] items-center gap-[6px] rounded-[6px] text-[12.5px] transition-colors ${
        label ? "px-[10px]" : "w-[30px] justify-center"
      } ${
        active
          ? "bg-[var(--surface)] font-medium text-[var(--ink)]"
          : "text-[var(--slate)] hover:bg-[var(--surface)]"
      }`}
    >
      <Icon name={icon} size={iconSize} />
      {label}
    </button>
  );
}

/* -------------------------------------------------------------- Divider */

export function VDivider() {
  return <span className="h-[18px] w-px shrink-0 bg-[var(--hairline)]" />;
}

/* ----------------------------------------------------------- PanelRow */

export function PanelRow({
  icon,
  dot,
  title,
  meta,
  active,
  onClick,
}: {
  icon?: IconName;
  dot?: string;
  title: string;
  meta?: string;
  active?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`font-app flex w-full items-center gap-[9px] rounded-[6px] px-[8px] py-[8px] text-left transition-colors ${
        active
          ? "bg-[#eae7e3] font-medium text-[var(--ink)]"
          : "text-[var(--slate)] hover:bg-[#f1efec]"
      }`}
    >
      {dot ? (
        <span className="size-[6px] shrink-0 rounded-full" style={{ background: dot }} />
      ) : null}
      {icon ? <Icon name={icon} size={14} className="shrink-0" /> : null}
      <span className="min-w-0 flex-1 truncate text-[13px]">{title}</span>
      {meta ? (
        <span
          className={`shrink-0 text-[11px] ${active ? "text-[var(--steel)]" : "text-[var(--stone)]"}`}
        >
          {meta}
        </span>
      ) : null}
    </button>
  );
}

export function GroupLabel({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={`px-[8px] pt-[12px] pb-[6px] text-[11px] font-semibold tracking-[0.6px] text-[var(--stone)] uppercase ${className}`}
    >
      {children}
    </div>
  );
}

/* --------------------------------------------------------------- Search */

export function SearchField({
  value,
  onChange,
  placeholder,
  ariaLabel,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  ariaLabel?: string;
}) {
  return (
    <label className="mx-[14px] mb-[10px] flex items-center gap-[8px] rounded-[8px] border border-[var(--hairline)] bg-[var(--canvas)] px-[10px] py-[7px] text-[var(--stone)] focus-within:border-[var(--primary)]">
      <Icon name="search" size={14} />
      <input
        value={value}
        aria-label={ariaLabel}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="font-app w-full border-0 bg-transparent text-[13px] text-[var(--ink)] outline-none placeholder:text-[var(--stone)]"
      />
    </label>
  );
}

/* --------------------------------------------------------------- Card */

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={`rounded-[10px] border border-[var(--hairline)] bg-[var(--canvas)] px-[14px] py-[13px] ${className}`}
    >
      {children}
    </div>
  );
}
