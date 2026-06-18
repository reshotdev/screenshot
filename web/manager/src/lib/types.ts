export interface Workspace {
  name: string;
  description?: string;
  scenarios: string[];
  variants: {
    dimensions: Record<string, string[]>;
    presets: Record<string, Record<string, string>>;
  };
  commits?: Array<{
    id: string;
    message: string;
    scenarioKeys: string[];
    assetCount: number;
    createdAt: string;
    platformCommitId?: string;
  }>;
  resolvedScenarios: Scenario[];
  allScenarios: Scenario[];
}

export interface Scenario {
  name: string;
  key: string;
  url: string;
  steps: any[];
  contexts?: any;
  matrix?: any[][];
  category?: string;
  metadata?: any;
  variant?: Record<string, string>;
  variantPreset?: string;
  locale?: string;
  role?: string;
  output?: {
    format?: "step-by-step-images" | "summary-video";
    highlight?: {
      color?: string;
      style?: string;
    };
    subtitles?: {
      enabled?: boolean;
    };
  };
  description?: string;
}

export interface AssetGroup {
  scenarioKey: string;
  variationSlug: string;
  assets: Array<{
    path: string;
    step: string;
    filename: string;
    captureKey?: string;
    url?: string;
  }>;
}

export interface Job {
  id: string;
  type: "run" | "publish" | "record";
  status: "pending" | "running" | "success" | "failed" | "cancelled";
  createdAt: string;
  updatedAt: string;
  scenarioKey?: string | null;
  logs: Array<{ timestamp: string; message: string }>;
  progress?: number;
  metadata?: any;
}

export interface Settings {
  projectId?: string;
  apiKey?: string;
  baseUrl?: string;
  assetDir?: string;
  headless?: boolean;
  concurrency?: number;
  isAuthenticated?: boolean;
}
