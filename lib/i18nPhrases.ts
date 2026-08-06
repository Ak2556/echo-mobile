import type { AppLanguageCode } from './languages';

/**
 * Hand-authored translations for arbitrary UI strings wrapped in `tt('...')`,
 * keyed by the exact English source text. This is the offline, quota-free
 * path for the long tail of hardcoded screen chrome (deep mini-apps, detail
 * screens) that never got a formal i18n key.
 *
 * Resolution (see `ttRaw` in i18n.ts): TT_PHRASES > runtime cache > English.
 * Anything not listed here still falls back to the runtime translator when AI
 * credits are available — this map just makes the high-traffic strings render
 * reliably with no network, no quota, no build step.
 */
export const TT_PHRASES: Partial<Record<AppLanguageCode, Record<string, string>>> = {
  hi: {
    // Shared mini-app chrome
    'Action': 'कार्रवाई', 'Open': 'खुले', 'active': 'सक्रिय', 'Today': 'आज', 'High': 'ज़रूरी',
    'priority': 'प्राथमिकता', 'Share progress': 'प्रगति साझा करें', 'Break blockers': 'रुकावटें तोड़ें',
    'Done': 'पूर्ण', 'Normal': 'सामान्य', 'Low': 'कम', 'Tomorrow': 'कल', 'Morning': 'सुबह',
    'Noon': 'दोपहर', 'Evening': 'शाम', 'Night': 'रात',

    // Tasks
    'Tasks': 'कार्य', 'Your execution queue': 'आपकी कार्य सूची', 'Priorities, dates, action.': 'प्राथमिकताएं, तारीखें, कार्रवाई।',
    'due now': 'अभी बाकी', 'Plan next 3': 'अगले 3 प्लान करें', 'Add a task...': 'एक कार्य जोड़ें...',
    'Optional note': 'वैकल्पिक नोट', 'No due': 'कोई नहीं', 'Set time': 'समय सेट करें',
    'Turn reminder off': 'रिमाइंडर बंद करें', 'Remind me': 'याद दिलाएं', 'Reminder on': 'रिमाइंडर चालू',
    'Add task': 'कार्य जोड़ें', 'No due date': 'कोई तिथि नहीं', 'Nothing here': 'यहां कुछ नहीं',
    'Add the next task that actually moves something forward.': 'अगला कार्य जोड़ें जो सचमुच कुछ आगे बढ़ाए।',
    'Turn intent into next actions': 'इरादे को अगले कदमों में बदलें',
    'Keep the next step visible, then share progress or ask Echo to break down blockers.': 'अगला कदम सामने रखें, फिर प्रगति साझा करें या Echo से रुकावटें तोड़ने को कहें।',
    'Due today': 'आज बाकी', 'High priority': 'उच्च प्राथमिकता',
    'Task added · reminder set': 'कार्य जोड़ा · रिमाइंडर सेट', 'Task added': 'कार्य जोड़ा गया',

    // Notes
    'Notes': 'नोट्स', 'New': 'नया', 'Saved': 'सहेजा गया', 'words': 'शब्द', 'chars': 'अक्षर', 'done': 'पूर्ण',
    'Capture note': 'नोट लिखें', 'Edit note': 'नोट संपादित करें', 'Note title': 'नोट शीर्षक', 'Folder': 'फ़ोल्डर',
    'Tags': 'टैग', 'Add checkbox': 'चेकबॉक्स जोड़ें', 'Heading': 'शीर्षक', 'Bullet': 'बुलेट',
    'Start writing, paste research, plan tasks, or make a checklist...': 'लिखना शुरू करें, रिसर्च पेस्ट करें, कार्य प्लान करें, या चेकलिस्ट बनाएं...',
    'Blank': 'खाली', 'Task plan': 'कार्य योजना', 'Meeting': 'मीटिंग', 'Idea': 'विचार', 'Journal': 'जर्नल',
    'Research': 'रिसर्च', 'Note': 'नोट', 'Checklist': 'चेकलिस्ट',
    'Inbox': 'इनबॉक्स', 'Work': 'काम', 'Ideas': 'विचार', 'Personal': 'निजी',
    'Unpin note': 'नोट अनपिन करें', 'Pin note': 'नोट पिन करें', 'Remove favorite': 'पसंदीदा हटाएं',
    'Add to favorites': 'पसंदीदा में जोड़ें', 'Share note': 'नोट साझा करें', 'Duplicate note': 'नोट की नकल',
    'Restore note': 'नोट पुनर्स्थापित करें', 'Archive note': 'नोट संग्रहित करें', 'Delete note': 'नोट हटाएं',
    'Publish note as an Echo': 'नोट को Echo के रूप में प्रकाशित करें',
    'Note updated': 'नोट अपडेट हुआ', 'Note saved': 'नोट सहेजा गया', 'Note duplicated': 'नोट की नकल बनी',
    'Delete note?': 'नोट हटाएं?', 'This cannot be undone.': 'इसे वापस नहीं किया जा सकता।', 'Cancel': 'रद्द करें',
    'Delete': 'हटाएं', 'copy': 'की नकल',
    'Capture ideas, tasks, research': 'विचार, कार्य, रिसर्च संजोएं', 'Knowledge capture system': 'ज्ञान संग्रह प्रणाली',
    'Ideas, drafts, recall.': 'विचार, ड्राफ्ट, स्मरण।', 'Active': 'सक्रिय', 'notes': 'नोट्स', 'Words': 'शब्द',
    'saved': 'सहेजे', 'Lists': 'सूचियां', 'checklists': 'चेकलिस्ट', 'Templates': 'टेम्पलेट', 'Folders': 'फ़ोल्डर',
    'Echo drafts': 'Echo ड्राफ्ट', 'Turn notes into outcomes': 'नोट्स को परिणामों में बदलें',
    'Use saved ideas as coaching context, progress proof, or public Echo drafts.': 'सहेजे विचारों को कोचिंग संदर्भ, प्रगति प्रमाण, या सार्वजनिक Echo ड्राफ्ट के रूप में उपयोग करें।',
    'Search notes, tags, folders...': 'नोट्स, टैग, फ़ोल्डर खोजें...', 'Pinned': 'पिन किए', 'Favorites': 'पसंदीदा',
    'Checklists': 'चेकलिस्ट', 'Archive': 'संग्रह', 'All': 'सभी', 'Recent': 'हालिया', 'Oldest': 'सबसे पुराने',
    'No matching notes': 'कोई मेल खाता नोट नहीं', 'Archive is empty': 'संग्रह खाली है', 'No notes yet': 'अभी कोई नोट नहीं',
    'Try another word, folder, or tag.': 'कोई और शब्द, फ़ोल्डर, या टैग आज़माएं।',
    'Start with a template or capture a blank note.': 'किसी टेम्पलेट से शुरू करें या खाली नोट लिखें।', 'Create note': 'नोट बनाएं',
    'Unpinned': 'अनपिन किया', 'Removed favorite': 'पसंदीदा हटाया', 'Favorited': 'पसंदीदा बनाया',
    'Restored': 'पुनर्स्थापित', 'Archived': 'संग्रहित',

    // Habits
    'Habits': 'आदतें', 'Streak': 'लय', 'Save': 'सहेजें', 'Error': 'त्रुटि', 'Photos': 'तस्वीरें',
    'Consistency engine': 'निरंतरता इंजन', 'Streaks, proof, recovery.': 'लय, प्रमाण, वापसी।',
    'due': 'बाकी', 'Best': 'सर्वश्रेष्ठ', 'streak': 'लय', 'Proof': 'प्रमाण', 'logs': 'लॉग',
    'Proof-backed': 'प्रमाण-समर्थित', 'Reminder-ready': 'रिमाइंडर-तैयार', 'Compare progress': 'प्रगति की तुलना करें',
    'Permission needed to add a photo': 'तस्वीर जोड़ने के लिए अनुमति चाहिए', 'Could not add the photo': 'तस्वीर नहीं जुड़ सकी',
    'Check-in saved': 'चेक-इन सहेजा गया', 'Could not save': 'सहेजा नहीं जा सका',
    'Checked off at': 'चेक किया गया', 'NOTE': 'नोट', 'How did it go? What did you do?': 'कैसा रहा? आपने क्या किया?',
    'PHOTO PROOF': 'फ़ोटो प्रमाण', 'Take photo': 'फ़ोटो लें', 'Choose photo': 'फ़ोटो चुनें',
    'This photo lives on another device.': 'यह तस्वीर किसी और डिवाइस पर है।',
    'Enter a habit name': 'आदत का नाम दर्ज करें', 'Edit Habit': 'आदत संपादित करें', 'New Habit': 'नई आदत',
    'HABIT NAME': 'आदत का नाम', 'e.g. Drink water, Exercise…': 'जैसे पानी पिएं, व्यायाम करें…', 'ICON': 'आइकन',
    'COLOR': 'रंग', 'WHICH DAYS': 'कौन से दिन', 'TIMES PER DAY': 'रोज़ कितनी बार',
    'simple check': 'सामान्य चेक', 'taps to complete': 'पूरा करने के लिए टैप', 'TIMES PER WEEK': 'हफ़्ते में कितनी बार',
    'Daily': 'रोज़', 'DAILY REMINDER': 'रोज़ का रिमाइंडर', 'None': 'कोई नहीं', 'Save Changes': 'बदलाव सहेजें',
    'Add Habit': 'आदत जोड़ें', 'Habit updated': 'आदत अपडेट हुई', 'added': 'जोड़ा गया',
    'of': 'में से', 'due today': 'आज बाकी', 'Perfect!': 'बढ़िया!', 'Make consistency social': 'निरंतरता को सामाजिक बनाएं',
    'Share streaks, compare progress, and turn proof-backed habits into public updates.': 'लय साझा करें, प्रगति की तुलना करें, और प्रमाण-समर्थित आदतों को सार्वजनिक अपडेट में बदलें।',
    'Best streak': 'सर्वश्रेष्ठ लय', 'Proofs': 'प्रमाण', 'No habits yet': 'अभी कोई आदत नहीं',
    'Start with one small behavior you can repeat and prove.': 'एक छोटी आदत से शुरू करें जिसे आप दोहरा और साबित कर सकें।',
    'Add your first habit': 'अपनी पहली आदत जोड़ें', 'day streak': 'दिन की लय', 'rest day': 'आराम का दिन',
    'View note & proof': 'नोट और प्रमाण देखें', 'Add note or photo proof': 'नोट या फ़ोटो प्रमाण जोड़ें',
    'Hide': 'छिपाएं', 'Show': 'दिखाएं', 'total': 'कुल',

    // Expenses
    'Expenses': 'खर्च', 'Control': 'नियंत्रण', 'Required': 'आवश्यक', 'Export': 'निर्यात',
    'Enter a valid amount': 'सही राशि दर्ज करें', 'Pick a category': 'एक श्रेणी चुनें', 'Add Transaction': 'लेन-देन जोड़ें',
    'expense': 'खर्च', 'income': 'आय', 'AMOUNT': 'राशि', 'CATEGORY': 'श्रेणी', 'NOTE (optional)': 'नोट (वैकल्पिक)',
    'What was this for?': 'यह किसलिए था?', 'Add': 'जोड़ें', 'Expense': 'खर्च', 'Income': 'आय',
    'Money pulse': 'पैसे की नब्ज़', 'Pace, room, forecast.': 'गति, गुंजाइश, अनुमान।', 'Pressure': 'दबाव',
    'No budget': 'कोई बजट नहीं', 'On track': 'सही राह पर', 'Over pace': 'गति से ज़्यादा', 'pace': 'गति',
    'set budget': 'बजट सेट करें', 'Daily room': 'रोज़ की गुंजाइश', 'Set': 'सेट करें', 'days left': 'दिन बाकी',
    'Projected': 'अनुमानित', 'month end': 'महीने का अंत', 'Save rate': 'बचत दर', 'positive': 'सकारात्मक',
    'negative': 'नकारात्मक', 'Monthly Budget': 'मासिक बजट',
    'How much do you plan to spend per month? Leave empty to remove the budget.': 'आप हर महीने कितना खर्च करना चाहते हैं? बजट हटाने के लिए खाली छोड़ें।',
    'Save Budget': 'बजट सहेजें', 'Currency': 'मुद्रा', 'Search USD, INR, Euro, Yen...': 'USD, INR, यूरो, येन खोजें...',
    'Money decision board': 'पैसे का निर्णय बोर्ड', 'Income, spend, budget.': 'आय, खर्च, बजट।', 'Balance': 'शेष',
    'Spent': 'खर्च किया', 'Budget': 'बजट', 'Multi-currency': 'बहु-मुद्रा', 'Budget pressure': 'बजट दबाव',
    'CSV export': 'CSV निर्यात', 'Matching balance': 'मेल खाता शेष', 'INCOME': 'आय', 'EXPENSES': 'खर्च',
    'BUDGET': 'बजट', 'SET A MONTHLY BUDGET': 'एक मासिक बजट सेट करें', 'over budget': 'बजट से ऊपर',
    'Money decisions, not just logs': 'पैसे के निर्णय, सिर्फ़ लॉग नहीं',
    'Turn spending data into budget coaching, accountability, and weekly finance updates.': 'खर्च डेटा को बजट कोचिंग, जवाबदेही, और साप्ताहिक वित्त अपडेट में बदलें।',
    'Off': 'बंद', 'Where it went': 'कहां गया', 'Search category or note (all months)': 'श्रेणी या नोट खोजें (सभी महीने)',
    'No matches': 'कोई मेल नहीं', 'Nothing in': 'इसमें कुछ नहीं', 'Try a different search or category.': 'कोई और खोज या श्रेणी आज़माएं।',
    'Add the first money move to see this month clearly.': 'इस महीने को साफ़ देखने के लिए पहला लेन-देन जोड़ें।',
    'Export expenses': 'खर्च निर्यात करें', 'Nothing to export yet': 'निर्यात के लिए अभी कुछ नहीं',
    'Delete?': 'हटाएं?', 'Remove this transaction?': 'यह लेन-देन हटाएं?',
    // Expense/income categories
    'Food': 'खाना', 'Transport': 'परिवहन', 'Shopping': 'खरीदारी', 'Health': 'स्वास्थ्य', 'Bills': 'बिल',
    'Entertainment': 'मनोरंजन', 'Travel': 'यात्रा', 'Other': 'अन्य', 'Salary': 'वेतन', 'Freelance': 'फ्रीलांस',
    'Gift': 'उपहार', 'Investment': 'निवेश',
  },
};
