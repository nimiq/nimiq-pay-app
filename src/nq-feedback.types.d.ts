export type App = 'nimiq-pay'
export type FormType = 'bug' | 'idea' | 'feedback'

export interface WidgetProps {
  app: App
  lang?: string
  feedbackEndpoint?: string
  dev?: boolean
}

export interface WidgetEvents {
  'form-selected': FormType
  'go-back': void
  'form-submitted': { success: true, data: any }
  'form-error': { success: false, error: string, details?: any }
  'before-submit': { formData: FormData, type: FormType, app: App }
}

export interface WidgetInstance {
  showFormGrid: () => void
  showForm: (type: FormType) => void
  closeWidget: () => void
  goBack: () => void
  destroy: () => void
  communication?: {
    on: <K extends keyof WidgetEvents>(event: K, callback: (data: WidgetEvents[K]) => void) => void
    off: <K extends keyof WidgetEvents>(event: K, callback?: (data: WidgetEvents[K]) => void) => void
    emit: <K extends keyof WidgetEvents>(event: K, data: WidgetEvents[K]) => void
  }
}

export type MountFeedbackWidgetFn = (selector: string, props?: WidgetProps) => WidgetInstance

declare global {
  interface Window {
    mountFeedbackWidget: MountFeedbackWidgetFn
  }
}

export { }
