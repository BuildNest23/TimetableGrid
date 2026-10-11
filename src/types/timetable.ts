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

export interface TimetableData {
  schoolName: string;
  academicYear: string;
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
  printSize: 'xs' | 's' | 'm' | 'l' | 'xl';
  printOrientation: 'landscape' | 'portrait';
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

export const VIEW_SIZES: Record<string, { mult: number; label: string }> = {
  xs: { mult: 0.75, label: "Extra Small" },
  s: { mult: 0.9, label: "Small" },
  m: { mult: 1, label: "Medium" },
  l: { mult: 1.2, label: "Large" },
  xl: { mult: 1.45, label: "Extra Large" },
};

export const DEMO_TIMETABLE_DATA: TimetableData = {
  schoolName: "Government High School",
  academicYear: "2026-2027",
  printNote: "Principal: Name Surname",
  wholeTitle: "Whole School Timetable",
  allTeachersTitle: "All Teachers Timetable",
  periods: [1, 2, 3, 4, 5, 6, 7, 8],
  breakAfter: 4,
  days: DAY_NAMES.slice(0, 5),
  daysPerWeek: 5,
  classes: [
    [
      "10th EM",
      "Mr. Rashid",
      "High",
      ["Maths", "English", "Physics", "Chemistry", "Biology", "Urdu", "Islamiat", "Pak Studies"],
      ["Mr. Rashid", "Ms. Ayesha", "Mr. Tariq", "Mr. Tariq", "Dr. Imran", "Mr. Naveed", "Qari Saeed", "Mr. Rashid"],
      [null, null, null, null, { subject: "Computer Science", teacher: "Sir Kamran", mode: "parallel", days: [] }, null, null, null]
    ],
    [
      "9th EM",
      "Mr. Tariq",
      "High",
      ["English", "Maths", "Biology", "Chemistry", "Physics", "Islamiat", "Urdu", "PT"],
      ["Ms. Ayesha", "Mr. Rashid", "Dr. Imran", "Mr. Tariq", "Mr. Tariq", "Qari Saeed", "Mr. Naveed", "Mr. Aslam"],
      [null, null, { subject: "Computer Science", teacher: "Sir Kamran", mode: "parallel", days: [] }, null, null, null, null, null]
    ],
    [
      "8th Grade",
      "Ms. Ayesha",
      "Middle",
      ["Science", "Urdu", "Maths", "English", "Drawing", "Islamiat", "Hist/Geog", "Library"],
      ["Dr. Imran", "Mr. Naveed", "Mr. Rashid", "Ms. Ayesha", "Mr. Aslam", "Qari Saeed", "Mr. Naveed", "Mr. Aslam"],
      [null, null, null, null, { subject: "IST", teacher: "Qari Saeed", mode: "rotation", days: [3, 4] }, null, null, null]
    ],
    [
      "7th Grade",
      "Dr. Imran",
      "Middle",
      ["Urdu", "Science", "English", "Maths", "Islamiat", "Hist/Geog", "Computer", "PT"],
      ["Mr. Naveed", "Dr. Imran", "Ms. Ayesha", "Mr. Rashid", "Qari Saeed", "Mr. Naveed", "Sir Kamran", "Mr. Aslam"],
      [null, null, null, null, null, null, null, null]
    ]
  ],
  teachers: [
    "Mr. Rashid",
    "Ms. Ayesha",
    "Mr. Tariq",
    "Dr. Imran",
    "Sir Kamran",
    "Mr. Naveed",
    "Qari Saeed",
    "Mr. Aslam"
  ],
  subjects: [
    "Maths",
    "English",
    "Physics",
    "Chemistry",
    "Biology",
    "Computer Science",
    "Science",
    "Urdu",
    "Islamiat",
    "Pak Studies",
    "Hist/Geog",
    "Drawing",
    "IST",
    "PT",
    "Library"
  ],
  teacherInfo: {
    "Mr. Rashid": { qual: "Science", rank: "SST", desig: "Senior Teacher" },
    "Ms. Ayesha": { qual: "Arts", rank: "SST", desig: "English Specialist" },
    "Mr. Tariq": { qual: "Science", rank: "SST", desig: "Science Incharge" },
    "Dr. Imran": { qual: "Science", rank: "EST", desig: "Bio/Chem Teacher" },
    "Sir Kamran": { qual: "IT", rank: "IT", desig: "IT Lab Incharge" },
    "Mr. Naveed": { qual: "Arts", rank: "EST", desig: "Urdu/Social Teacher" },
    "Qari Saeed": { qual: "Arts", rank: "EST", desig: "Arabic/Islamiat" },
    "Mr. Aslam": { qual: "Physical Education", rank: "PT", desig: "Sports Master" }
  },
  teacherLeaves: {},
  leaveDate: new Date().toISOString().slice(0, 10),
  longLeaves: [],
  conflictExceptions: [],
  periodTimes: [
    { start: "8:00 AM", end: "8:40 AM" },
    { start: "8:40 AM", end: "9:20 AM" },
    { start: "9:20 AM", end: "10:00 AM" },
    { start: "10:00 AM", end: "10:40 AM" },
    { start: "11:00 AM", end: "11:40 AM" },
    { start: "11:40 AM", end: "12:20 PM" },
    { start: "12:20 PM", end: "1:00 PM" },
    { start: "1:00 PM", end: "1:40 PM" }
  ],
  fridayTimings: {
    enabled: true,
    dayIndex: 4,
    assemblyTime: { start: "8:00 AM", end: "8:15 AM" },
    periodTimes: [
      { start: "8:15 AM", end: "8:50 AM" },
      { start: "8:50 AM", end: "9:25 AM" },
      { start: "9:25 AM", end: "10:00 AM" },
      { start: "10:00 AM", end: "10:35 AM" },
      { start: "10:35 AM", end: "11:10 AM" },
      { start: "11:10 AM", end: "11:45 AM" },
      { start: "", end: "" },
      { start: "", end: "" }
    ],
    breakAfter: 4,
    breakLabel: "JUMMA BREAK",
    note: "Early dismissal on Friday for Jumma prayer",
    combined: false
  },
  schoolTimingsTitle: "SCHOOL TIMINGS",
  effectiveFromDate: "01/09/2026",
  assemblyTime: { start: "7:45 AM", end: "8:00 AM" },
  showTimingsSignature: true,
  autoChainTimes: true,
  freeStaffIncludeNonTeaching: false,
  substituteIncludeNonTeaching: false,
  substituteRecommendWorkload: true,
  substituteRecommendGroup: true,
  hideEmptyTeachersInTT: false,
  printSize: 'm',
  printOrientation: 'landscape',
  stripSize: 'm',
  viewSize: 'm',
  schoolLogo: '',
  signatureEnabled: true
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
  | 'printing';
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
  printSize: 'm',
  printOrientation: 'landscape',
  stripSize: 'm',
  viewSize: 'm',
  schoolLogo: "",
  signatureEnabled: false
};