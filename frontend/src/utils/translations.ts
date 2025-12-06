export type Language = 'tr' | 'en';

export const translations = {
  tr: {
    // --- NAVIGATION (Menü Linkleri) ---
    navUpload: "PDF Yükle",
    navMerge: "PDF Birleştir",
    navConvert: "PDF to TXT",
    navExtract: "Sayfa Çıkar",
    navEdit: "Sayfa Düzenle",
    navSummarize: "PDF Özetleme",

    // --- GENEL ---
    appTitle: "Neuro-PDF",
    loading: "Yükleniyor...",
    error: "Bir hata oluştu",
    success: "İşlem Başarılı",
    warning: "Uyarı",

    // --- LANDING PAGE (Ana Sayfa) ---
    landingDescription: "PDF belgelerini yükle, yapay zeka ile özetle ve analiz et. Hızlı, güvenli ve kolay bir deneyim seni bekliyor.",
    guestLogin: "Misafir Girişi",
    guestLoggingIn: "Giriş Yapılıyor...",
    guestLoginError: "Misafir oturumu oluşturulamadı.",
    signOut: "Çıkış Yap",
    sessionChecking: "Oturum bilgisi kontrol ediliyor...",
    loggedInAs: "Giriş yapıldı:",
    notLoggedIn: "Henüz giriş yapmadın.",

    // --- AUTH (Giriş & Kayıt) ---
    loginTitle: "Hesabınıza giriş yapın",
    registerTitle: "Hesap Oluştur",
    registerSubtitle: "Hemen aramıza katılın",
    username: "Kullanıcı Adı",
    email: "Email",
    password: "Şifre",
    loginButton: "Giriş Yap",
    loginButtonLoading: "Giriş yapılıyor...",
    registerButton: "Kayıt Ol",
    registerButtonLoading: "Kayıt Yapılıyor...",
    registerSuccess: "Kayıt başarılı! Giriş sayfasına yönlendiriliyorsunuz...",
    registerError: "Kayıt başarısız oldu. Lütfen bilgileri kontrol edin.",
    loginLink: "Giriş Yap",
    loginError: "Giriş yapılamadı. Bilgilerinizi kontrol edin.",
    authRequiredToken: "Kimlik doğrulama tokenı bulunamadı. Lütfen tekrar giriş yapın.",
    googleLogin: "Google ile Giriş Yap",
    or: "veya",
    noAccount: "Hesabın yok mu?",
    hasAccount: "Zaten hesabın var mı?",
    createAccount: "Hemen Oluştur",

    // --- UPLOAD PAGE (Yükleme Sayfası) ---
    uploadPageTitle: "PDF AI — Yükleme",
    guestUploadWarning: "Giriş yaparak dosyalarınızı kalıcı olarak saklayabilirsiniz.",
    userLoggedIn: "Giriş yaptınız:",
    uploadDropActive: "Dosyayı bırakın, yüklemeye hazırlansın...",
    uploadDropPassive: "PDF'yi sürükleyip bırakın veya tıklayın",
    changeFileHint: "Değiştirmek için yeni bir PDF sürükleyin.",
    uploadButton: "Yükle",
    uploading: "Yükleniyor...",
    uploadSuccess: "Yüklendi",
    tempId: "Geçici ID",
    unknownUploadError: "Bilinmeyen yükleme hatası",
    selectFile: "Dosya Seç",
    usePanelFile: "Sağ Paneldeki PDF'i Kullan",
    panelPdfError: "Sağ panelde bir PDF bulunamadı.",
    currentFile: "Şu anki dosya:",
    selectedFile: "Seçilen:",

    // --- CONVERT TEXT PAGE (Metin Dönüştürme Sayfası) ---
    pageTitle: "PDF AI — PDF'ten Metin Dönüştürücü", // convert-pdf sayfası için
    textConvertedTitle: "📄 Metin Dönüştürüldü:",
    textReadyMessage: "Metin dosyası hazır! İndirerek tüm içeriği görebilirsiniz.",
    converting: "Metin Dönüştürülüyor...",
    convertText: "Metni Dönüştür",
    dropActive: "Dosyayı bırakın, yüklemeye hazırlansın...", // <--- EKLENDİ (Hata düzeltmesi)
    dropPassive: "PDF'yi buraya sürükleyip bırakın veya aşağıdaki butonlarla seçin", // <--- EKLENDİ (Hata düzeltmesi)

    // --- MERGE PAGE (Birleştirme Sayfası) ---
    mergePageTitle: "PDF AI — PDF Birleştirici",
    mergeMinFilesError: "Lütfen birleştirmek için en az 2 PDF dosyası seçin.",
    addPanelFile: "Sağ Paneldeki PDF'i Ekle",
    selectedFiles: "Seçilen Dosyalar",
    clearAll: "Tümünü Temizle",
    remove: "Kaldır",
    mergeOrderHint: "Dosyalar yukarıdaki sıraya göre birleştirilecektir.",
    merging: "Birleştiriliyor...",
    mergeButton: "PDF'leri Birleştir",
    mergedPdfPreview: "📄 Birleştirilmiş PDF Önizleme:",
    mergeSuccessTitle: "✅ PDF'ler Başarıyla Birleştirildi!",
    continue: "Devam Et",
    save: "Kaydet",
    dropFilesActive: "Dosyaları bırakın…",
    dropFilesPassive: "PDF'leri buraya sürükleyip bırakın veya tıklayıp seçin",
    fileAlreadyInList: "zaten listede.",
    saveError: "Kaydetme hatası",
    unknownMergeError: "Bilinmeyen birleştirme hatası",
    mergeFailed: "Birleştirme başarısız oldu",
    pdfAddedToPanel: "✅ PDF sağ panelde görünecek!",

    // --- EXTRACT PAGE (Sayfa Çıkarma Sayfası) ---
    extractPageTitle: "PDF AI — Sayfa Çıkarıcı",
    extractDropActive: "Dosyayı bırakın, yeni işlem başlatılsın.",
    extractDropPassive: "PDF'yi buraya sürükleyip bırakın veya tıklayıp seçin",
    pagesToExtractLabel: "Çıkarılacak Sayfalar:",
    pageRangePlaceholder: "Örn: 1, 3-5, 10-12",
    pageRangeHint: "Tek sayfa (3), aralık (10-15) veya virgülle ayrılmış liste yazabilirsiniz.",
    extractButton: "Sayfaları Çıkar",
    extracting: "Çıkarılıyor...",
    pdfPreviewTitle: "📄 PDF Önizleme:",
    extractedPdfPreviewTitle: "📄 Çıkarılan PDF Önizleme:",
    enterPageRangeError: "Lütfen bir sayfa numarası veya aralığı girin (örn: 5, 10-20).",
    extractionFailed: "Sayfa çıkarma işlemi başarısız oldu.",
    uploadFirst: "Lütfen önce bir PDF dosyası yükleyin.",

    // --- EDIT PAGE (Düzenleme/Sıralama Sayfası) ---
    editPageTitle: "PDF AI — Sayfa Düzenleyici",
    editDropActive: "Dosyayı bırakın, yüklensin...",
    editDropPassive: "PDF'yi buraya sürükleyip bırakın veya butonlarla seçin",
    previewDragDrop: "📄 PDF Önizleme — Sayfaları Sürükle & Bırak",
    orderIndex: "SIRA",
    origPage: "Orj. Sayfa",
    processAndDownload: "Sıralamayı Kaydet ve İşle",
    reorderSuccess: "Sayfalar Başarıyla Sıralandı!",
    reorderError: "Sıralama ve indirme başarısız oldu.",
    emptyPdfError: "Boş PDF alındı.",
    selectPdfFirst: "Lütfen önce bir PDF seçin.",

    // --- SUMMARİZE PAGE (PDF ÖZETLETME)
    summarizeTitle: "📄 PDF Özeti",
    summarizeFailed: "Özetleme başarısız oldu.",
    summarizing: "Özetleniyor...",
    summarizeButton: "Özetle",
    downloadPdf: "PDF Olarak İndir",
    newProcess: "Yeni İşlem",
    summaryResult: "Özet Sonucu",

    // --- PDF VIEWER & PANEL ---
    activePdfTitle: "📄 Aktif PDF",
    dragHint: "İşlem yapmak için dosyayı sürükleyin",
    removeFile: "Dosyayı Kaldır",
    dragToUse: "Kullanmak için sürükle",
    pdfLoading: "PDF Yükleniyor...",
    pdfError: "PDF görüntülenemedi.",
    page: "Sayfa",
    
    // --- ORTAK EYLEMLER (Common Actions) ---
    download: "İndir",
    saveToFiles: "Dosyalarıma Kaydet",
    saving: "Kaydediliyor...",
    processSuccess: "İşlem Tamamlandı!",
    loginWarning: "Giriş yaparak dosyalarınızı kaydedebilirsiniz.",
    saveSuccess: "✅ Dosya kaydedildi!",
    fileSize: "Boyut",

    // --- USAGE LIMIT ---
    limitTitle: "Günlük Limit Doldu",
    limitMessage: "Misafir kullanıcı olarak günlük işlem limitinize ulaştınız.",
    limitLoginCall: "Devam etmek için lütfen giriş yapın veya kayıt olun.",
    limitLoginButton: "Giriş Yap / Kayıt Ol",
    limitCancel: "Vazgeç"
  },
  en: {
    // --- NAVIGATION ---
    navUpload: "Upload PDF",
    navMerge: "Merge PDFs",
    navConvert: "PDF to TXT",
    navExtract: "Extract Pages",
    navEdit: "Edit Pages",
    navSummarize: "Summarize PDF",

    // --- GENERAL ---
    appTitle: "Neuro-PDF",
    loading: "Loading...",
    error: "An error occurred",
    success: "Success",
    warning: "Warning",

    // --- LANDING PAGE ---
    landingDescription: "Upload PDF documents, summarize and analyze with AI. A fast, secure, and easy experience awaits you.",
    guestLogin: "Guest Login",
    guestLoggingIn: "Logging in...",
    guestLoginError: "Guest session creation failed.",
    signOut: "Sign Out",
    sessionChecking: "Checking session info...",
    loggedInAs: "Logged in as:",
    notLoggedIn: "You have not logged in yet.",

    // --- AUTH (Login & Register) ---
    loginTitle: "Sign in to your account",
    registerTitle: "Create Account",
    registerSubtitle: "Join us today",
    username: "Username",
    email: "Email",
    password: "Password",
    loginButton: "Sign In",
    loginButtonLoading: "Signing in...",
    registerButton: "Sign Up",
    registerButtonLoading: "Signing up...",
    registerSuccess: "Registration successful! Redirecting to login...",
    registerError: "Registration failed. Please check your details.",
    loginLink: "Sign In",
    loginError: "Login failed. Please check your credentials.",
    authRequiredToken: "Authentication token not found. Please log in again.",
    googleLogin: "Sign in with Google",
    or: "or",
    noAccount: "Don't have an account?",
    hasAccount: "Already have an account?",
    createAccount: "Create Now",

    // --- UPLOAD PAGE ---
    uploadPageTitle: "PDF AI — Upload",
    guestUploadWarning: "Log in to save your files permanently.",
    userLoggedIn: "Logged in as:",
    uploadDropActive: "Drop the file to prepare upload...",
    uploadDropPassive: "Drag & drop PDF here or click to select",
    changeFileHint: "Drag a new PDF to change.",
    uploadButton: "Upload",
    uploading: "Uploading...",
    uploadSuccess: "Uploaded",
    tempId: "Temp ID",
    unknownUploadError: "Unknown upload error",
    selectFile: "Select File",
    usePanelFile: "Use PDF from Right Panel",
    panelPdfError: "No PDF found in the right panel.",
    currentFile: "Current file:",
    selectedFile: "Selected:",

    // --- CONVERT TEXT PAGE ---
    pageTitle: "PDF AI — PDF to Text Converter",
    textConvertedTitle: "📄 Text Converted:",
    textReadyMessage: "Text file is ready! You can download to see full content.",
    converting: "Converting Text...",
    convertText: "Convert Text",
    dropActive: "Drop the file to prepare upload...", // <--- EKLENDİ
    dropPassive: "Drag & drop PDF here or select using buttons below", // <--- EKLENDİ

    // --- MERGE PAGE ---
    mergePageTitle: "PDF AI — PDF Merger",
    mergeMinFilesError: "Please select at least 2 PDF files to merge.",
    addPanelFile: "Add PDF from Right Panel",
    selectedFiles: "Selected Files",
    clearAll: "Clear All",
    remove: "Remove",
    mergeOrderHint: "Files will be merged in the order shown above.",
    merging: "Merging...",
    mergeButton: "Merge PDFs",
    mergedPdfPreview: "📄 Merged PDF Preview:",
    mergeSuccessTitle: "✅ PDFs Merged Successfully!",
    continue: "Continue",
    save: "Save",
    dropFilesActive: "Drop files...",
    dropFilesPassive: "Drag & drop PDFs here or click to select",
    fileAlreadyInList: "is already in the list.",
    saveError: "Save error",
    unknownMergeError: "Unknown merge error",
    mergeFailed: "Merge failed",
    pdfAddedToPanel: "✅ PDF will appear in the right panel!",

    // --- EXTRACT PAGE ---
    extractPageTitle: "PDF AI — Page Extractor",
    extractDropActive: "Drop the file to start a new process.",
    extractDropPassive: "Drag & drop PDF here or click to select",
    pagesToExtractLabel: "Pages to Extract:",
    pageRangePlaceholder: "Ex: 1, 3-5, 10-12",
    pageRangeHint: "You can enter single pages (3), ranges (10-15), or comma-separated lists.",
    extractButton: "Extract Pages",
    extracting: "Extracting...",
    pdfPreviewTitle: "📄 PDF Preview:",
    extractedPdfPreviewTitle: "📄 Extracted PDF Preview:",
    enterPageRangeError: "Please enter a page number or range (e.g., 5, 10-20).",
    extractionFailed: "Page extraction failed.",
    uploadFirst: "Please upload a PDF file first.",

    // --- EDIT PAGE ---
    editPageTitle: "PDF AI — Page Editor",
    editDropActive: "Drop the file to load...",
    editDropPassive: "Drag & drop PDF here or select with buttons",
    previewDragDrop: "📄 PDF Preview — Drag & Drop Pages",
    orderIndex: "ORDER",
    origPage: "Orig. Page",
    processAndDownload: "Save Order & Process",
    reorderSuccess: "Pages Reordered Successfully!",
    reorderError: "Reorder and download failed.",
    emptyPdfError: "Received empty PDF.",
    selectPdfFirst: "Please select a PDF first.",

    // --- SUMMARİZE PAGE ---
    summarizeTitle: "📄 PDF Summary",
    summarizeFailed: "Summarization failed.",
    summarizing: "Summarizing...",
    summarizeButton: "Summarize",
    downloadPdf: "Download PDF",
    summaryResult: "Summary Result",

    // --- PDF VIEWER & PANEL ---
    activePdfTitle: "📄 Active PDF",
    dragHint: "Drag file to process",
    removeFile: "Remove File",
    dragToUse: "Drag to use",
    pdfLoading: "Loading PDF...",
    pdfError: "PDF could not be displayed.",
    page: "Page",

    // --- COMMON ACTIONS ---
    download: "Download",
    saveToFiles: "Save to My Files",
    saving: "Saving...",
    newProcess: "New Process",
    processSuccess: "Process Completed!",
    loginWarning: "You can save files by logging in.",
    saveSuccess: "✅ File saved!",
    fileSize: "Size",

    // --- USAGE LIMIT ---
    limitTitle: "Daily Limit Reached",
    limitMessage: "You have reached your daily usage limit as a guest.",
    limitLoginCall: "Please log in or register to continue.",
    limitLoginButton: "Login / Register",
    limitCancel: "Cancel"
  }
};