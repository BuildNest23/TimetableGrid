export interface Slot2 {
  subject: string;
  teacher: string;
  mode: 'parallel' | 'rotation' | 'same';
  days: number[]; // 0-indexed day numbers
}

export type ClassItem = [
  string, // 0: Name (e.g. "10th EM")
  string, // 1: Incharge (e.g. "Mr. David")
  string, // 2: Section (e.g. "High", "Middle")
  string[], // 3: Subjects for each period
  string[], // 4: Teachers for each period
  (Slot2 | null)[] // 5: 2nd slot for each period
];

export interface TeacherInfo {
  qual: string; // Group (e.g. "Science", "Arts", "IT")
  rank: string; // Grade (e.g. "SST", "EST", "PST")
  desig: string; // Designation (e.g. "Principal", "Head")
}

export interface LongLeave {
  id: string;
  teacher: string;
  from: string; // "YYYY-MM-DD"
  to: string; // "YYYY-MM-DD" or "" for open-ended
  reason: string;
}

/**
 * The Substitute Board for one date.
 * - absent: teachers whose periods need cover on that date
 * - assigned: absent teacher -> period index (as string, 0-based) -> substitute teacher
 */
export interface SubstituteBoard {
  absent: string[];
  assigned: Record<string, Record<string, string>>;
}

export interface ConflictException {
  period: number; // 0-indexed
  teacher: string;
  classes: string[];
  days: number[];
}

export interface PeriodTime {
  start: string;
  end: string;
}

export interface FridayTimings {
  enabled: boolean;
  dayIndex: number;
  assemblyTime: { start: string; end: string };
  periodTimes: PeriodTime[];
  breakAfter: number;
  breakLabel: string;
  note: string;
  combined: boolean;
}

export type PeriodsDisplay = 'day' | 'week' | 'both';

export interface TimetableData {
  schoolName: string;
  academicYear: string;
  /** false = leave the academic year/session out of printed and exported sheets (default: included) */
  printAcademicYear?: boolean;
  printNote: string;
  wholeTitle: string;
  allTeachersTitle: string;
  periods: number[];
  breakAfter: number;
  days: string[];
  daysPerWeek: number;
  classes: ClassItem[];
  teachers: string[];
  subjects: string[];
  teacherInfo: Record<string, TeacherInfo>;
  teacherLeaves: Record<string, string[]>;
  leaveDate: string;
  longLeaves: LongLeave[];
  /** Saved Substitute Board per date ("YYYY-MM-DD"): absent list and who covers which period. */
  substituteBoards: Record<string, SubstituteBoard>;
  conflictExceptions: ConflictException[];
  periodTimes: PeriodTime[];
  fridayTimings: FridayTimings;
  schoolTimingsTitle: string;
  effectiveFromDate: string;
  assemblyTime: { start: string; end: string };
  showTimingsSignature: boolean;
  autoChainTimes: boolean;
  freeStaffIncludeNonTeaching: boolean;
  substituteIncludeNonTeaching: boolean;
  substituteRecommendWorkload: boolean;
  substituteRecommendGroup: boolean;
  hideEmptyTeachersInTT: boolean;
  periodsDisplay: PeriodsDisplay;
  printSize: 'xs' | 's' | 'm' | 'l' | 'xl';
  printOrientation: 'landscape' | 'portrait';
  printFontPt?: number;
  printTimes?: boolean;
  printBreakCol?: boolean;
  stripSize: string;
  viewSize: 'xs' | 's' | 'm' | 'l' | 'xl';
  schoolLogo: string;
  signatureEnabled: boolean;
}

export const RANK_LIST = ["SST", "EST", "PST", "PT", "IT"];
export const QUAL_LIST = ["Science", "Arts", "IT", "Physical Education"];
export const DESIG_LIST = ["Principal", "Vice Principal", "Head", "Coordinator", "Section Head", "Incharge"];
export const DAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

export const PRINT_SIZES: Record<string, { mult: number; label: string }> = {
  xs: { mult: 0.60, label: "Extra Small (most compact)" },
  s: { mult: 0.72, label: "Small" },
  m: { mult: 1, label: "Medium (default)" },
  l: { mult: 1.20, label: "Large" },
  xl: { mult: 1.45, label: "Extra Large (biggest)" },
};


export type ActiveTab = 
  | 'dashboard'
  | 'settings'
  | 'master'
  | 'editor'
  | 'views'
  | 'substitute'
  | 'freestaff'
  | 'roster'
  | 'printstudio';
export const EMPTY_TIMETABLE_DATA: TimetableData = {
  schoolName: "",
  academicYear: "",
  printNote: "",
  wholeTitle: "Whole School Timetable",
  allTeachersTitle: "All Teachers Timetable",
  periods: [1, 2, 3, 4, 5, 6, 7, 8],
  breakAfter: 0,
  days: DAY_NAMES.slice(0, 5),
  daysPerWeek: 5,
  classes: [],
  teachers: [],
  subjects: [],
  teacherInfo: {},
  teacherLeaves: {},
  leaveDate: "",
  longLeaves: [],
  substituteBoards: {},
  conflictExceptions: [],
  periodTimes: [1, 2, 3, 4, 5, 6, 7, 8].map(() => ({ start: "", end: "" })),
  fridayTimings: {
    enabled: false,
    dayIndex: 4,
    assemblyTime: { start: "", end: "" },
    periodTimes: [1, 2, 3, 4, 5, 6, 7, 8].map(() => ({ start: "", end: "" })),
    breakAfter: 0,
    breakLabel: "JUMMA BREAK",
    note: "",
    combined: true
  },
  schoolTimingsTitle: "SCHOOL TIMINGS",
  effectiveFromDate: "",
  assemblyTime: { start: "", end: "" },
  showTimingsSignature: false,
  autoChainTimes: true,
  freeStaffIncludeNonTeaching: false,
  substituteIncludeNonTeaching: false,
  substituteRecommendWorkload: true,
  substituteRecommendGroup: true,
  hideEmptyTeachersInTT: false,
  periodsDisplay: 'both',
  printSize: 'm',
  printOrientation: 'landscape',
  printFontPt: 7.5,
  printTimes: false,
  printBreakCol: true,
  stripSize: 'm',
  viewSize: 'm',
  schoolLogo: "",
  signatureEnabled: false
};

/** Academic year text for print/export headers — empty when the user excluded it. */
export function printYear(data: { academicYear: string; printAcademicYear?: boolean }): string {
  return data.printAcademicYear === false ? '' : (data.academicYear || '');
}
