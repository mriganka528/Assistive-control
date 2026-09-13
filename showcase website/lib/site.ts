export const RELEASE_VERSION = "1.0.1";
export const REPOSITORY_URL = "https://github.com/mriganka528/Assistive-control";
export const DOWNLOADS = {
  setup: "https://github.com/mriganka528/Assistive-control/releases/download/assistive-control-1.0.1/Assistive-Control-Setup-x64.exe",
  portable: "https://github.com/mriganka528/Assistive-control/releases/download/assistive-control-1.0.1/Assistive-Control-Portable-x64.exe",
} as const;

export const screenshots = [
  {
    id: "home",
    label: "A simple starting point",
    shortLabel: "Home",
    src: "/screenshots/home.png",
    title: "Everything starts with you.",
    description: "Calibrate your movements, return to a saved profile, or fine-tune your settings. The input banner tells you when real computer control is available.",
    alt: "Assistive Control home screen with the real control status, Start, Recalibrate, and Open settings buttons.",
    width: 1200,
    height: 820,
  },
  {
    id: "settings",
    label: "Comfort, at your pace",
    shortLabel: "Settings",
    src: "/screenshots/settings.png",
    title: "Make the controls feel right.",
    description: "Adjust cursor speed, sensitivity, and scrolling. Keep assisted switching on to review a suggested movement change before accepting it.",
    alt: "Assistive Control settings showing assisted and automatic switching, cursor speed, cursor sensitivity, and scroll speed.",
    width: 1200,
    height: 820,
  },
  {
    id: "mapping",
    label: "Your movements, your mapping",
    shortLabel: "Control mapping",
    src: "/screenshots/mapping.png",
    title: "A movement can do more.",
    description: "Choose which of your calibrated movements moves the pointer, scrolls, or clicks. Use once, twice, or hold patterns for different actions.",
    alt: "Assistive Control movement mapping with pointer directions, scroll directions, and once, twice, or hold options for clicks and Enter.",
    width: 1200,
    height: 820,
  },
] as const;

export const faqs = [
  {
    question: "What do I need to use Assistive Control?",
    answer: "A Windows 10 or Windows 11 PC with a 64-bit Intel or AMD processor, a working webcam, and permission for desktop apps to access that camera. The download includes the app, its libraries, and its face and hand tracking models. Node.js and developer tools are not needed.",
  },
  {
    question: "Which download should I choose?",
    answer: "Choose the installer for your everyday PC: it installs the app and creates shortcuts. Choose the portable version to open the app without installing it. They contain the same application, and you only need one. The portable app still saves a profile locally on the PC you use.",
  },
  {
    question: "Do I have to use a particular gesture?",
    answer: "No fixed gesture is required. Calibration asks you to repeat movements you can perform comfortably, then looks for reliable face or hand signals. Available controls depend on what calibration detects; different people can get different mappings.",
  },
  {
    question: "Does my camera video leave my computer?",
    answer: "No. Tracking and calibration run on your device. Video and movement signals are not uploaded, and your profile is saved locally. An internet connection is needed to download the app, but the bundled tracking models work offline afterward.",
  },
  {
    question: "How do I pause or stop control?",
    answer: "Live Control starts automatically once the camera is ready. Use Pause for a break, or Emergency stop to halt control. Ctrl + Shift + X is the global emergency-stop shortcut, including when another window has focus. Learn these controls before starting a session.",
  },
  {
    question: "What if Windows shows a publisher warning?",
    answer: "The current EXEs are unsigned, so Windows may show an unknown-publisher or SmartScreen message. Check that your file came from this project's GitHub release before deciding whether to run it. You do not need to disable Windows security settings.",
  },
] as const;
