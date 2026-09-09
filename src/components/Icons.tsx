/**
 * Every icon in the app, mapped onto Lucide's thin-line set.
 *
 * Kept as an `Icon.*` object rather than importing Lucide directly at each call
 * site: the names here are the app's vocabulary (Sparkle, Board, Chevron), not
 * Lucide's, so swapping the underlying set again later stays a one-file change.
 * Default sizes match what each call site was already passing.
 */
import {
  ArrowRight,
  Building2,
  Calendar,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronsUpDown,
  Circle,
  CircleAlert,
  Clock,
  Columns3,
  Copy,
  Download,
  ExternalLink,
  FileText,
  FolderClosed,
  Gauge,
  GraduationCap,
  Handshake,
  Home,
  Image,
  Inbox,
  Shuffle,
  LayoutGrid,
  List,
  LogOut,
  Mail,
  Map,
  MessageSquare,
  Menu,
  Moon,
  OctagonX,
  Pencil,
  Plus,
  Search,
  Send,
  ShieldCheck,
  Sparkles,
  Square,
  StickyNote,
  Sun,
  Target,
  Terminal,
  Trash2,
  TriangleAlert,
  Trophy,
  User,
  Volume2,
  VolumeX,
  X,
  Zap,
  ChartColumn,
  CircleMinus,
  type LucideIcon,
} from 'lucide-react';

interface Props {
  className?: string;
}

/** Lucide defaults to 24px; the app sizes everything with Tailwind classes
 *  instead, so size is neutralised and `className` stays in charge. */
function make(C: LucideIcon, fallback: string) {
  return ({ className = fallback }: Props) => (
    <C className={className} size={undefined} strokeWidth={1.75} aria-hidden="true" />
  );
}

/** The actual Gmail brand mark (not a Lucide glyph, so it bypasses `make()` —
 *  this needs its real four-colour fill, not a single-colour stroke icon). */
function GmailLogo({ className = 'w-4 h-4' }: Props) {
  return (
    <svg viewBox="0 0 48 48" className={className} aria-hidden="true">
      <path fill="#4285F4" d="M45,16.2l-5,2.75l-5,4.75V16.2l5-4h4C44.55,12.2,45,12.65,45,13.2V16.2z" />
      <path fill="#34A853" d="M3,16.2l5,2.75l5,4.75V16.2l-5-4H4C3.45,12.2,3,12.65,3,13.2V16.2z" />
      <path fill="#EA4335" d="M35,11.2H13l-2,2v9.5l13,9.75l13-9.75v-9.5L35,11.2z" />
      <path fill="#FBBC04" d="M3,16.2v19.6C3,36.75,4.25,38,5.8,38H13V23.7L3,16.2z" />
      <path fill="#4285F4" d="M45,16.2v19.6c0,1.55-1.25,2.8-2.8,2.8H35V23.7L45,16.2z" />
      <path fill="#C5221F" d="M13,11.2h22l-11,8.25L13,11.2z" />
    </svg>
  );
}

export const Icon = {
  Search: make(Search, 'w-4 h-4'),
  Plus: make(Plus, 'w-4 h-4'),
  Sun: make(Sun, 'w-4 h-4'),
  Moon: make(Moon, 'w-4 h-4'),
  Square: make(Square, 'w-4 h-4'),
  Image: make(Image, 'w-4 h-4'),
  Volume: make(Volume2, 'w-4 h-4'),
  Mute: make(VolumeX, 'w-4 h-4'),
  Shuffle: make(Shuffle, 'w-4 h-4'),
  Folder: make(FolderClosed, 'w-3.5 h-3.5'),
  External: make(ExternalLink, 'w-3.5 h-3.5'),
  Sparkle: make(Sparkles, 'w-3 h-3'),
  Clock: make(Clock, 'w-3 h-3'),
  Calendar: make(Calendar, 'w-3 h-3'),
  Paperplane: make(Send, 'w-4 h-4'),
  Chat: make(MessageSquare, 'w-4 h-4'),
  Trophy: make(Trophy, 'w-4 h-4'),
  List: make(List, 'w-4 h-4'),
  Board: make(Columns3, 'w-4 h-4'),
  Trash: make(Trash2, 'w-4 h-4'),
  Check: make(Check, 'w-3 h-3'),
  Warning: make(CircleAlert, 'w-3 h-3'),
  Close: make(X, 'w-4 h-4'),
  Chart: make(ChartColumn, 'w-4 h-4'),
  Arrow: make(ArrowRight, 'w-4 h-4'),
  Terminal: make(Terminal, 'w-4 h-4'),
  Download: make(Download, 'w-4 h-4'),
  Mail: make(Mail, 'w-4 h-4'),
  Sparkles: make(Sparkles, 'w-4 h-4'),
  Chevron: make(ChevronDown, 'w-4 h-4'),
  Sort: make(ChevronsUpDown, 'w-4 h-4'),
  Withdrawn: make(CircleMinus, 'w-3 h-3'),
  Zap: make(Zap, 'w-4 h-4'),
  Gauge: make(Gauge, 'w-3.5 h-3.5'),
  Target: make(Target, 'w-4 h-4'),
  Shield: make(ShieldCheck, 'w-4 h-4'),
  Map: make(Map, 'w-4 h-4'),
  CheckCircle: make(CheckCircle2, 'w-3.5 h-3.5'),
  Circle: make(Circle, 'w-3.5 h-3.5'),
  Triangle: make(TriangleAlert, 'w-3.5 h-3.5'),
  Octagon: make(OctagonX, 'w-3.5 h-3.5'),
  Edit: make(Pencil, 'w-3.5 h-3.5'),
  SignOut: make(LogOut, 'w-4 h-4'),
  Building: make(Building2, 'w-4 h-4'),
  Handshake: make(Handshake, 'w-4 h-4'),
  Copy: make(Copy, 'w-3.5 h-3.5'),
  Doc: make(FileText, 'w-3.5 h-3.5'),
  GradCap: make(GraduationCap, 'w-3 h-3'),
  Inbox: make(Inbox, 'w-8 h-8'),
  Home: make(Home, 'w-4 h-4'),
  Grid: make(LayoutGrid, 'w-4 h-4'),
  Menu: make(Menu, 'w-5 h-5'),
  User: make(User, 'w-3.5 h-3.5'),
  Note: make(StickyNote, 'w-3.5 h-3.5'),
  Gmail: GmailLogo,
};
