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
  },
};
