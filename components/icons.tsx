import type { ReactNode, SVGProps } from "react";

export type IconComponent = (props: SVGProps<SVGSVGElement>) => ReactNode;

function IconBase({ children, ...props }: SVGProps<SVGSVGElement> & { children: ReactNode }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {children}
    </svg>
  );
}

export const ArrowLeft: IconComponent = (props) => (
  <IconBase {...props}><path d="m12 19-7-7 7-7" /><path d="M19 12H5" /></IconBase>
);
export const ArrowRight: IconComponent = (props) => (
  <IconBase {...props}><path d="M5 12h14" /><path d="m12 5 7 7-7 7" /></IconBase>
);
export const ArrowUp: IconComponent = (props) => (
  <IconBase {...props}><path d="m18 15-6-6-6 6" /></IconBase>
);
export const Plus: IconComponent = (props) => (
  <IconBase {...props}><path d="M5 12h14" /><path d="M12 5v14" /></IconBase>
);
export const X: IconComponent = (props) => (
  <IconBase {...props}><path d="M18 6 6 18" /><path d="m6 6 12 12" /></IconBase>
);
export const Play: IconComponent = (props) => (
  <IconBase {...props}><path d="m6 3 14 9-14 9Z" /></IconBase>
);
export const Pause: IconComponent = (props) => (
  <IconBase {...props}><path d="M8 5v14" /><path d="M16 5v14" /></IconBase>
);
export const Send: IconComponent = (props) => (
  <IconBase {...props}><path d="M14.5 21.7 22 2 2.3 9.5l8 3.2Z" /><path d="M22 2 10.9 13.1" /></IconBase>
);
export const Paperclip: IconComponent = (props) => (
  <IconBase {...props}><path d="m16 6-8.4 8.6a2 2 0 0 0 2.8 2.8l8.4-8.6a4 4 0 1 0-5.6-5.6l-8.4 8.5a6 6 0 1 0 8.5 8.5l8.4-8.5" /></IconBase>
);
export const Mic: IconComponent = (props) => (
  <IconBase {...props}><rect x="9" y="2" width="6" height="12" rx="3" /><path d="M5 10a7 7 0 0 0 14 0" /><path d="M12 17v5" /></IconBase>
);
export const UserRound: IconComponent = (props) => (
  <IconBase {...props}><circle cx="12" cy="8" r="5" /><path d="M20 21a8 8 0 0 0-16 0" /></IconBase>
);
export const LogIn: IconComponent = (props) => (
  <IconBase {...props}><path d="M10 17l5-5-5-5" /><path d="M15 12H3" /><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" /></IconBase>
);
export const Settings: IconComponent = (props) => (
  <IconBase {...props}><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-4V21a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H2.8v-4H3a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1a1.7 1.7 0 0 0 1.9.3A1.7 1.7 0 0 0 10 3V2.8h4V3a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2v4H21a1.7 1.7 0 0 0-1.6 1Z" /></IconBase>
);
export const CircleDollarSign: IconComponent = (props) => (
  <IconBase {...props}><circle cx="12" cy="12" r="10" /><path d="M16 8h-6a2 2 0 1 0 0 4h4a2 2 0 1 1 0 4H8" /><path d="M12 18V6" /></IconBase>
);
export const Languages: IconComponent = (props) => (
  <IconBase {...props}><path d="m5 8 6 6" /><path d="m4 14 6-6 2-3" /><path d="M2 5h12" /><path d="M7 2h1" /><path d="m22 22-5-10-5 10" /><path d="M14 18h6" /></IconBase>
);
export const Thermometer: IconComponent = (props) => (
  <IconBase {...props}><path d="M14 4v10.5a4 4 0 1 1-4 0V4a2 2 0 0 1 4 0Z" /></IconBase>
);
export const CircleHelp: IconComponent = (props) => (
  <IconBase {...props}><circle cx="12" cy="12" r="10" /><path d="M9.1 9a3 3 0 1 1 5.8 1c0 2-3 2-3 4" /><path d="M12 18h.01" /></IconBase>
);
export const MessageCircle: IconComponent = (props) => (
  <IconBase {...props}><path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4Z" /></IconBase>
);
export const FileText: IconComponent = (props) => (
  <IconBase {...props}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" /><path d="M14 2v6h6" /><path d="M16 13H8" /><path d="M16 17H8" /></IconBase>
);
export const BedDouble: IconComponent = (props) => (
  <IconBase {...props}><path d="M2 20v-8a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v8" /><path d="M4 10V6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v4" /><path d="M2 18h20" /></IconBase>
);
export const HeartHandshake: IconComponent = (props) => (
  <IconBase {...props}><path d="M19 14.8 14.8 19a2 2 0 0 1-2.8 0L5 12a5 5 0 0 1 7-7l1 1 1-1a5 5 0 0 1 7 7Z" /><path d="m12 15 3-3" /></IconBase>
);
export const Diamond: IconComponent = (props) => (
  <IconBase {...props}><path d="M6 3h12l4 6-10 12L2 9Z" /><path d="m2 9 10 3 10-3" /><path d="M12 21V12" /></IconBase>
);
export const Sparkles: IconComponent = (props) => (
  <IconBase {...props}><path d="m12 3-1.5 4.5L6 9l4.5 1.5L12 15l1.5-4.5L18 9l-4.5-1.5Z" /><path d="m5 3-.5 1.5L3 5l1.5.5L5 7l.5-1.5L7 5l-1.5-.5Z" /><path d="m19 16-1 3-3 1 3 1 1 3 1-3 3-1-3-1Z" /></IconBase>
);
