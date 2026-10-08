/* ------------------------------------------------------------------ */
/*  Courier profiles + barcode encoding                                */
/* ------------------------------------------------------------------ */

export interface CourierEncoding {
  /** Text placed before the AWB inside the barcode */
  prefix: string;
  /** Text placed after the AWB inside the barcode */
  suffix: string;
}

export interface BarcodePreset {
  id: string;
  label: string;
  prefix: string;
  suffix: string;
}

/** Built-in encoding presets. Users can pick one per courier. */
export const BARCODE_PRESETS: BarcodePreset[] = [
  { id: 'plain',     label: 'Plain — AWB as-is',     prefix: '',   suffix: ''   },
  { id: 'asterisk',  label: 'Asterisk — *AWB*',      prefix: '*',  suffix: '*'  },
  { id: 'delhivery', label: 'Delhivery — AWB + IN',  prefix: '',   suffix: 'IN' },
  { id: 'bluedart',  label: 'Blue Dart — BD + AWB',  prefix: 'BD', suffix: ''   },
  { id: 'dtdc',      label: 'DTDC — AWB + X',        prefix: '',   suffix: 'X'  },
  { id: 'custom',    label: 'Custom prefix / suffix…', prefix: '', suffix: ''   },
];

const USER_PREFS_KEY = 'otbims.courier.encoding.v1';

/** Saved map of { [courierName]: { prefix, suffix } } */
type UserPrefs = Record<string, CourierEncoding>;

function loadUserPrefs(): UserPrefs {
  try {
    const raw = localStorage.getItem(USER_PREFS_KEY);
    if (raw) return JSON.parse(raw) as UserPrefs;
  } catch {}
  return {};
}

function saveUserPrefs(prefs: UserPrefs): void {
  try {
    localStorage.setItem(USER_PREFS_KEY, JSON.stringify(prefs));
  } catch {}
}

/** Save user's chosen encoding for a specific courier. */
export function setCourierEncoding(courierName: string, enc: CourierEncoding): void {
  const prefs = loadUserPrefs();
  prefs[courierName] = enc;
  saveUserPrefs(prefs);
}

/** Get the encoding the user set for a courier, or infer from the name. */
export function getCourierEncoding(courierName: string): CourierEncoding {
  const prefs = loadUserPrefs();
  if (prefs[courierName]) return prefs[courierName];

  // Heuristic fallback for known couriers
  const lower = courierName.toLowerCase();
  if (lower.includes('delhivery'))   return { prefix: '',   suffix: 'IN' };
  if (lower.includes('blue dart') || lower.includes('bluedart')) return { prefix: 'BD', suffix: '' };
  if (lower.includes('dtdc'))        return { prefix: '',   suffix: 'X'  };
  if (lower.includes('india post') || lower.includes('speed post')) return { prefix: '', suffix: '' };

  return { prefix: '', suffix: '' };
}

/** Compose the string that actually goes into the barcode. */
export function composeBarcodeContent(awb: string, enc: CourierEncoding): string {
  return `${enc.prefix}${awb}${enc.suffix}`;
}
