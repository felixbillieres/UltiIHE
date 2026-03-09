// UltiIHE i18n translations
// Flat dot-notation keys, 6 languages

export type TranslationKey =
  | "settings.title"
  | "settings.tabs.general"
  | "settings.tabs.providers"
  | "settings.tabs.models"
  | "settings.tabs.keybinds"
  | "settings.tabs.appearance"
  | "settings.general.theme"
  | "settings.general.colorScheme"
  | "settings.general.fontSize"
  | "settings.general.fontFamily"
  | "settings.general.language"
  | "settings.providers.connected"
  | "settings.providers.available"
  | "settings.providers.connect"
  | "settings.providers.disconnect"
  | "settings.providers.apiKey"
  | "settings.providers.apiKeyPlaceholder"
  | "settings.providers.save"
  | "settings.providers.freeTier"
  | "settings.providers.models"
  | "settings.models.title"
  | "settings.models.search"
  | "settings.models.context"
  | "settings.models.reasoning"
  | "settings.models.vision"
  | "settings.models.tools"
  | "settings.keybinds.title"
  | "settings.keybinds.reset"
  | "settings.keybinds.resetAll"
  | "settings.keybinds.recording"
  | "theme.exegol-dark"
  | "theme.midnight"
  | "theme.dracula"
  | "theme.nord"
  | "theme.catppuccin"
  | "theme.light"
  | "theme.scheme.dark"
  | "theme.scheme.light"
  | "theme.scheme.system"
  | "common.close"
  | "common.cancel"
  | "common.save"
  | "common.reset"
  | "chat.placeholder"
  | "chat.ready"
  | "chat.readyDesc"
  | "chat.thinking"
  | "chat.shiftEnter"
  | "terminal.title"
  | "terminal.new"
  | "terminal.noContainer"
  | "terminal.addPrompt"
  | "sidebar.files"
  | "sidebar.terminals"
  | "sidebar.findings"
  | "mode.build"
  | "mode.build.desc"
  | "mode.plan"
  | "mode.plan.desc"
  | "mode.deep"
  | "mode.deep.desc"

export type Language = "en" | "fr" | "de" | "es" | "ja" | "zh"

export const translations: Record<Language, Record<TranslationKey, string>> = {
  en: {
    "settings.title": "Settings",
    "settings.tabs.general": "General",
    "settings.tabs.providers": "Providers",
    "settings.tabs.models": "Models",
    "settings.tabs.keybinds": "Keyboard Shortcuts",
    "settings.tabs.appearance": "Appearance",
    "settings.general.theme": "Theme",
    "settings.general.colorScheme": "Color Scheme",
    "settings.general.fontSize": "Font Size",
    "settings.general.fontFamily": "Font Family",
    "settings.general.language": "Language",
    "settings.providers.connected": "Connected",
    "settings.providers.available": "Available Providers",
    "settings.providers.connect": "Connect",
    "settings.providers.disconnect": "Disconnect",
    "settings.providers.apiKey": "API Key",
    "settings.providers.apiKeyPlaceholder": "Enter API key...",
    "settings.providers.save": "Save",
    "settings.providers.freeTier": "Free tier",
    "settings.providers.models": "{{count}} models",
    "settings.models.title": "Models",
    "settings.models.search": "Search models...",
    "settings.models.context": "{{size}} context",
    "settings.models.reasoning": "Reasoning",
    "settings.models.vision": "Vision",
    "settings.models.tools": "Tools",
    "settings.keybinds.title": "Keyboard Shortcuts",
    "settings.keybinds.reset": "Reset",
    "settings.keybinds.resetAll": "Reset All",
    "settings.keybinds.recording": "Press keys...",
    "theme.exegol-dark": "Exegol Dark",
    "theme.midnight": "Midnight",
    "theme.dracula": "Dracula",
    "theme.nord": "Nord",
    "theme.catppuccin": "Catppuccin",
    "theme.light": "Light",
    "theme.scheme.dark": "Dark",
    "theme.scheme.light": "Light",
    "theme.scheme.system": "System",
    "common.close": "Close",
    "common.cancel": "Cancel",
    "common.save": "Save",
    "common.reset": "Reset",
    "chat.placeholder": "Ask the AI agent...",
    "chat.ready": "Ready to assist",
    "chat.readyDesc": "Ask me to run commands, scan targets, or analyze results",
    "chat.thinking": "Thinking...",
    "chat.shiftEnter": "Shift+Enter for new line",
    "terminal.title": "Terminal",
    "terminal.new": "New terminal",
    "terminal.noContainer": "No container selected",
    "terminal.addPrompt": "Click \"+\" to open a terminal",
    "sidebar.files": "Files",
    "sidebar.terminals": "Terminals",
    "sidebar.findings": "Findings",
    "mode.build": "Build",
    "mode.build.desc": "Standard agent with tool access",
    "mode.plan": "Plan",
    "mode.plan.desc": "Analysis mode, higher reasoning",
    "mode.deep": "Deep",
    "mode.deep.desc": "Maximum reasoning for complex tasks",
  },

  fr: {
    "settings.title": "Paramètres",
    "settings.tabs.general": "Général",
    "settings.tabs.providers": "Fournisseurs",
    "settings.tabs.models": "Modèles",
    "settings.tabs.keybinds": "Raccourcis clavier",
    "settings.tabs.appearance": "Apparence",
    "settings.general.theme": "Thème",
    "settings.general.colorScheme": "Palette de couleurs",
    "settings.general.fontSize": "Taille de police",
    "settings.general.fontFamily": "Police de caractères",
    "settings.general.language": "Langue",
    "settings.providers.connected": "Connectés",
    "settings.providers.available": "Fournisseurs disponibles",
    "settings.providers.connect": "Connecter",
    "settings.providers.disconnect": "Déconnecter",
    "settings.providers.apiKey": "Clé API",
    "settings.providers.apiKeyPlaceholder": "Saisir la clé API...",
    "settings.providers.save": "Enregistrer",
    "settings.providers.freeTier": "Offre gratuite",
    "settings.providers.models": "{{count}} modèles",
    "settings.models.title": "Modèles",
    "settings.models.search": "Rechercher un modèle...",
    "settings.models.context": "{{size}} de contexte",
    "settings.models.reasoning": "Raisonnement",
    "settings.models.vision": "Vision",
    "settings.models.tools": "Outils",
    "settings.keybinds.title": "Raccourcis clavier",
    "settings.keybinds.reset": "Réinitialiser",
    "settings.keybinds.resetAll": "Tout réinitialiser",
    "settings.keybinds.recording": "Appuyez sur les touches...",
    "theme.exegol-dark": "Exegol Sombre",
    "theme.midnight": "Minuit",
    "theme.dracula": "Dracula",
    "theme.nord": "Nord",
    "theme.catppuccin": "Catppuccin",
    "theme.light": "Clair",
    "theme.scheme.dark": "Sombre",
    "theme.scheme.light": "Clair",
    "theme.scheme.system": "Système",
    "common.close": "Fermer",
    "common.cancel": "Annuler",
    "common.save": "Enregistrer",
    "common.reset": "Réinitialiser",
    "chat.placeholder": "Interroger l'agent IA...",
    "chat.ready": "Prêt à vous assister",
    "chat.readyDesc": "Demandez-moi de lancer des commandes, scanner des cibles ou analyser des résultats",
    "chat.thinking": "Réflexion en cours...",
    "chat.shiftEnter": "Maj+Entrée pour un saut de ligne",
    "terminal.title": "Terminal",
    "terminal.new": "Nouveau terminal",
    "terminal.noContainer": "Aucun container sélectionné",
    "terminal.addPrompt": "Cliquez sur « + » pour ouvrir un terminal",
    "sidebar.files": "Fichiers",
    "sidebar.terminals": "Terminaux",
    "sidebar.findings": "Découvertes",
    "mode.build": "Build",
    "mode.build.desc": "Agent standard avec accès aux outils",
    "mode.plan": "Plan",
    "mode.plan.desc": "Mode analyse, raisonnement avancé",
    "mode.deep": "Deep",
    "mode.deep.desc": "Raisonnement maximal pour les tâches complexes",
  },

  de: {
    "settings.title": "Einstellungen",
    "settings.tabs.general": "Allgemein",
    "settings.tabs.providers": "Anbieter",
    "settings.tabs.models": "Modelle",
    "settings.tabs.keybinds": "Tastenkürzel",
    "settings.tabs.appearance": "Darstellung",
    "settings.general.theme": "Design",
    "settings.general.colorScheme": "Farbschema",
    "settings.general.fontSize": "Schriftgröße",
    "settings.general.fontFamily": "Schriftart",
    "settings.general.language": "Sprache",
    "settings.providers.connected": "Verbunden",
    "settings.providers.available": "Verfügbare Anbieter",
    "settings.providers.connect": "Verbinden",
    "settings.providers.disconnect": "Trennen",
    "settings.providers.apiKey": "API-Schlüssel",
    "settings.providers.apiKeyPlaceholder": "API-Schlüssel eingeben...",
    "settings.providers.save": "Speichern",
    "settings.providers.freeTier": "Kostenlose Stufe",
    "settings.providers.models": "{{count}} Modelle",
    "settings.models.title": "Modelle",
    "settings.models.search": "Modelle suchen...",
    "settings.models.context": "{{size}} Kontext",
    "settings.models.reasoning": "Schlussfolgerung",
    "settings.models.vision": "Bildverarbeitung",
    "settings.models.tools": "Werkzeuge",
    "settings.keybinds.title": "Tastenkürzel",
    "settings.keybinds.reset": "Zurücksetzen",
    "settings.keybinds.resetAll": "Alle zurücksetzen",
    "settings.keybinds.recording": "Tasten drücken...",
    "theme.exegol-dark": "Exegol Dunkel",
    "theme.midnight": "Mitternacht",
    "theme.dracula": "Dracula",
    "theme.nord": "Nord",
    "theme.catppuccin": "Catppuccin",
    "theme.light": "Hell",
    "theme.scheme.dark": "Dunkel",
    "theme.scheme.light": "Hell",
    "theme.scheme.system": "System",
    "common.close": "Schließen",
    "common.cancel": "Abbrechen",
    "common.save": "Speichern",
    "common.reset": "Zurücksetzen",
    "chat.placeholder": "Den KI-Agenten fragen...",
    "chat.ready": "Bereit zur Unterstützung",
    "chat.readyDesc": "Fragen Sie mich, Befehle auszuführen, Ziele zu scannen oder Ergebnisse zu analysieren",
    "chat.thinking": "Denke nach...",
    "chat.shiftEnter": "Umschalt+Eingabe für neue Zeile",
    "terminal.title": "Terminal",
    "terminal.new": "Neues Terminal",
    "terminal.noContainer": "Kein Container ausgewählt",
    "terminal.addPrompt": 'Klicken Sie auf "+" um ein Terminal zu \u00f6ffnen',
    "sidebar.files": "Dateien",
    "sidebar.terminals": "Terminals",
    "sidebar.findings": "Befunde",
    "mode.build": "Build",
    "mode.build.desc": "Standardagent mit Werkzeugzugriff",
    "mode.plan": "Plan",
    "mode.plan.desc": "Analysemodus mit erweitertem Denken",
    "mode.deep": "Deep",
    "mode.deep.desc": "Maximales Denkvermögen für komplexe Aufgaben",
  },

  es: {
    "settings.title": "Ajustes",
    "settings.tabs.general": "General",
    "settings.tabs.providers": "Proveedores",
    "settings.tabs.models": "Modelos",
    "settings.tabs.keybinds": "Atajos de teclado",
    "settings.tabs.appearance": "Apariencia",
    "settings.general.theme": "Tema",
    "settings.general.colorScheme": "Esquema de color",
    "settings.general.fontSize": "Tamaño de fuente",
    "settings.general.fontFamily": "Familia tipográfica",
    "settings.general.language": "Idioma",
    "settings.providers.connected": "Conectados",
    "settings.providers.available": "Proveedores disponibles",
    "settings.providers.connect": "Conectar",
    "settings.providers.disconnect": "Desconectar",
    "settings.providers.apiKey": "Clave API",
    "settings.providers.apiKeyPlaceholder": "Introducir clave API...",
    "settings.providers.save": "Guardar",
    "settings.providers.freeTier": "Plan gratuito",
    "settings.providers.models": "{{count}} modelos",
    "settings.models.title": "Modelos",
    "settings.models.search": "Buscar modelos...",
    "settings.models.context": "{{size}} de contexto",
    "settings.models.reasoning": "Razonamiento",
    "settings.models.vision": "Visión",
    "settings.models.tools": "Herramientas",
    "settings.keybinds.title": "Atajos de teclado",
    "settings.keybinds.reset": "Restablecer",
    "settings.keybinds.resetAll": "Restablecer todo",
    "settings.keybinds.recording": "Pulse las teclas...",
    "theme.exegol-dark": "Exegol Oscuro",
    "theme.midnight": "Medianoche",
    "theme.dracula": "Dracula",
    "theme.nord": "Nord",
    "theme.catppuccin": "Catppuccin",
    "theme.light": "Claro",
    "theme.scheme.dark": "Oscuro",
    "theme.scheme.light": "Claro",
    "theme.scheme.system": "Sistema",
    "common.close": "Cerrar",
    "common.cancel": "Cancelar",
    "common.save": "Guardar",
    "common.reset": "Restablecer",
    "chat.placeholder": "Preguntar al agente IA...",
    "chat.ready": "Listo para asistir",
    "chat.readyDesc": "Pídeme ejecutar comandos, escanear objetivos o analizar resultados",
    "chat.thinking": "Pensando...",
    "chat.shiftEnter": "Mayús+Intro para nueva línea",
    "terminal.title": "Terminal",
    "terminal.new": "Nuevo terminal",
    "terminal.noContainer": "Ningún container seleccionado",
    "terminal.addPrompt": "Haz clic en «+» para abrir un terminal",
    "sidebar.files": "Archivos",
    "sidebar.terminals": "Terminales",
    "sidebar.findings": "Hallazgos",
    "mode.build": "Build",
    "mode.build.desc": "Agente estándar con acceso a herramientas",
    "mode.plan": "Plan",
    "mode.plan.desc": "Modo de análisis, razonamiento avanzado",
    "mode.deep": "Deep",
    "mode.deep.desc": "Razonamiento máximo para tareas complejas",
  },

  ja: {
    "settings.title": "設定",
    "settings.tabs.general": "一般",
    "settings.tabs.providers": "プロバイダー",
    "settings.tabs.models": "モデル",
    "settings.tabs.keybinds": "キーボードショートカット",
    "settings.tabs.appearance": "外観",
    "settings.general.theme": "テーマ",
    "settings.general.colorScheme": "配色",
    "settings.general.fontSize": "フォントサイズ",
    "settings.general.fontFamily": "フォント",
    "settings.general.language": "言語",
    "settings.providers.connected": "接続済み",
    "settings.providers.available": "利用可能なプロバイダー",
    "settings.providers.connect": "接続",
    "settings.providers.disconnect": "切断",
    "settings.providers.apiKey": "APIキー",
    "settings.providers.apiKeyPlaceholder": "APIキーを入力...",
    "settings.providers.save": "保存",
    "settings.providers.freeTier": "無料プラン",
    "settings.providers.models": "{{count}}個のモデル",
    "settings.models.title": "モデル",
    "settings.models.search": "モデルを検索...",
    "settings.models.context": "{{size}}コンテキスト",
    "settings.models.reasoning": "推論",
    "settings.models.vision": "画像認識",
    "settings.models.tools": "ツール",
    "settings.keybinds.title": "キーボードショートカット",
    "settings.keybinds.reset": "リセット",
    "settings.keybinds.resetAll": "すべてリセット",
    "settings.keybinds.recording": "キーを押してください...",
    "theme.exegol-dark": "Exegol ダーク",
    "theme.midnight": "ミッドナイト",
    "theme.dracula": "ドラキュラ",
    "theme.nord": "ノルド",
    "theme.catppuccin": "カトプチーノ",
    "theme.light": "ライト",
    "theme.scheme.dark": "ダーク",
    "theme.scheme.light": "ライト",
    "theme.scheme.system": "システム",
    "common.close": "閉じる",
    "common.cancel": "キャンセル",
    "common.save": "保存",
    "common.reset": "リセット",
    "chat.placeholder": "AIエージェントに質問...",
    "chat.ready": "準備完了",
    "chat.readyDesc": "コマンドの実行、ターゲットのスキャン、結果の分析を依頼できます",
    "chat.thinking": "考え中...",
    "chat.shiftEnter": "Shift+Enterで改行",
    "terminal.title": "ターミナル",
    "terminal.new": "新しいターミナル",
    "terminal.noContainer": "コンテナが選択されていません",
    "terminal.addPrompt": "「+」をクリックしてターミナルを開く",
    "sidebar.files": "ファイル",
    "sidebar.terminals": "ターミナル",
    "sidebar.findings": "検出結果",
    "mode.build": "ビルド",
    "mode.build.desc": "ツールアクセス付き標準エージェント",
    "mode.plan": "プラン",
    "mode.plan.desc": "分析モード、高度な推論",
    "mode.deep": "ディープ",
    "mode.deep.desc": "複雑なタスク向けの最大推論",
  },

  zh: {
    "settings.title": "设置",
    "settings.tabs.general": "常规",
    "settings.tabs.providers": "服务商",
    "settings.tabs.models": "模型",
    "settings.tabs.keybinds": "快捷键",
    "settings.tabs.appearance": "外观",
    "settings.general.theme": "主题",
    "settings.general.colorScheme": "配色方案",
    "settings.general.fontSize": "字体大小",
    "settings.general.fontFamily": "字体",
    "settings.general.language": "语言",
    "settings.providers.connected": "已连接",
    "settings.providers.available": "可用服务商",
    "settings.providers.connect": "连接",
    "settings.providers.disconnect": "断开",
    "settings.providers.apiKey": "API密钥",
    "settings.providers.apiKeyPlaceholder": "输入API密钥...",
    "settings.providers.save": "保存",
    "settings.providers.freeTier": "免费套餐",
    "settings.providers.models": "{{count}}个模型",
    "settings.models.title": "模型",
    "settings.models.search": "搜索模型...",
    "settings.models.context": "{{size}}上下文",
    "settings.models.reasoning": "推理",
    "settings.models.vision": "视觉",
    "settings.models.tools": "工具",
    "settings.keybinds.title": "快捷键",
    "settings.keybinds.reset": "重置",
    "settings.keybinds.resetAll": "全部重置",
    "settings.keybinds.recording": "请按下按键...",
    "theme.exegol-dark": "Exegol 暗色",
    "theme.midnight": "午夜",
    "theme.dracula": "德古拉",
    "theme.nord": "北欧",
    "theme.catppuccin": "卡布奇诺",
    "theme.light": "浅色",
    "theme.scheme.dark": "深色",
    "theme.scheme.light": "浅色",
    "theme.scheme.system": "跟随系统",
    "common.close": "关闭",
    "common.cancel": "取消",
    "common.save": "保存",
    "common.reset": "重置",
    "chat.placeholder": "向AI助手提问...",
    "chat.ready": "准备就绪",
    "chat.readyDesc": "可以让我执行命令、扫描目标或分析结果",
    "chat.thinking": "思考中...",
    "chat.shiftEnter": "Shift+Enter换行",
    "terminal.title": "终端",
    "terminal.new": "新建终端",
    "terminal.noContainer": "未选择容器",
    "terminal.addPrompt": "点击「+」打开终端",
    "sidebar.files": "文件",
    "sidebar.terminals": "终端",
    "sidebar.findings": "发现",
    "mode.build": "构建",
    "mode.build.desc": "具备工具访问的标准代理",
    "mode.plan": "规划",
    "mode.plan.desc": "分析模式，增强推理",
    "mode.deep": "深度",
    "mode.deep.desc": "复杂任务的最大推理能力",
  },
}

/**
 * Resolve a translation key with optional template parameters.
 * Falls back to English, then to the raw key if not found.
 *
 * @example
 * t("fr", "settings.providers.models", { count: 12 }) // "12 modèles"
 * t("ja", "common.close") // "閉じる"
 */
export function t(
  lang: Language,
  key: TranslationKey,
  params?: Record<string, string | number>,
): string {
  const text = translations[lang]?.[key] ?? translations.en[key] ?? key
  if (!params) return text
  return text.replace(
    /\{\{\s*(\w+)\s*\}\}/g,
    (_, k: string) => String(params[k] ?? ""),
  )
}

/**
 * Detect the user's preferred language from browser settings.
 * Returns the closest supported Language, defaulting to "en".
 */
export function detectLanguage(): Language {
  const nav =
    typeof navigator !== "undefined"
      ? navigator.languages?.[0] ?? navigator.language ?? "en"
      : "en"
  const code = nav.split("-")[0].toLowerCase()
  if (code in translations) return code as Language
  return "en"
}
