import i18n from "i18next";
import { initReactI18next } from "react-i18next";

// 翻訳リソースを直接インポートする代わりに、動的に定義
const resources = {
  ja: {
    translation: {
      app: {
        title: "Image Converter",
        description: "画像を様々なフォーマットに変換",
      },
      header: {
        title: "Image Converter",
        github: "GitHub",
      },
      navigation: {
        top: "トップ",
        crop: "クロップ",
        convert: "変換",
      },
      home: {
        title: "Welcome to Image Converter",
        subtitle:
          "画像を簡単に変換しましょう。フォーマット変換、リサイズ、最適化を強力なオンラインツールで行えます。",
        startConverting: "変換を開始",
        tryCropTool: "クロップツールを試す",
        viewOnGithub: "GitHubで見る",
        features: {
          formatConversion: {
            title: "フォーマット変換",
            description:
              "JPEG、PNG、WebPなどの人気画像フォーマット間で高品質を保ちながら変換できます。",
          },
          imageCropping: {
            title: "画像クロップ",
            description:
              "直感的なクロップツールで画像を完璧なサイズにクロップ・リサイズできます。",
          },
          batchProcessing: {
            title: "バッチ処理",
            description:
              "複数の画像を一度に処理し、便利なZIPファイルとしてダウンロードできます。",
          },
        },
      },
      convert: {
        title: "変換設定",
        targetFormat: "対象フォーマット",
        qualitySettings: "品質設定",
        quality: "品質 (%)",
        imageSize: "画像サイズ（オプション）",
        width: "幅 (px)",
        height: "高さ (px)",
        maintainAspectRatio: "アスペクト比を維持",
        convert: "変換",
        converting: "変換中...",
        pleaseSelectFiles: "変換するファイルを選択してください",
        conversionError: "変換中にエラーが発生しました。",
        auto: "自動",
        pngQualityNotice:
          "PNG形式は可逆圧縮のため、品質設定は適用されません。常に最高品質で出力されます。",
        pngQualityExperimental:
          "PNG形式での品質制御を実験的にサポートしています。低い値ではファイルサイズが小さくなりますが、画質が劣化する場合があります。",
        pngQualityHelp:
          "PNG品質: 95以上=標準PNG、70-94=中圧縮、70未満=高圧縮（画質劣化あり）",
        qualityDescription:
          "品質: 低い値ほどファイルサイズが小さくなりますが、画質が劣化します",
      },
      crop: {
        title: "Image Cropping Tool",
        subtitle: "画像を完璧なサイズにクロップ・リサイズ",
        preview: "プレビュー",
        processing: "処理中...",
        downloadCroppedImage: "クロップした画像をダウンロード",
        selectNewImage: "新しい画像を選択",
        imageDetails: "画像詳細",
        fileName: "ファイル名",
        fileSize: "ファイルサイズ",
        fileType: "ファイル形式",
      },
      fileUpload: {
        dropFiles: "ファイルをここにドロップ",
        dropMoreFiles: "さらにファイルを追加",
        clickToSelect: "またはクリックしてファイルを選択",
        filesSelected: "ファイル選択済み",
        selectedFiles: "選択されたファイル",
        add: "追加",
        clearList: "リストをクリア",
        dragDropLabel: "画像をドラッグ&ドロップ",
        dropFilesHere: "ファイルをここにドロップ",
        viewDetails: "の詳細を表示",
      },
      fileDetails: {
        title: "ファイル詳細",
        basicInfo: "基本情報",
        fileName: "ファイル名",
        fileSize: "ファイルサイズ",
        fileFormat: "ファイル形式",
        lastModified: "最終更新",
        imageSize: "画像サイズ",
        exifInfo: "EXIF情報",
        unknown: "不明",
        loading: "読み込み中...",
        cannotPreview: "プレビューできません",
        close: "閉じる",
      },
      progress: {
        converting: "変換中...",
        pleaseWait: "ファイルを変換しています。しばらくお待ちください...",
      },
      results: {
        title: "変換結果",
        files: "ファイル",
        downloadZip: "Zipでダウンロード",
        creating: "作成中...",
        clear: "クリア",
        originalSize: "元のサイズ",
        convertedSize: "変換後サイズ",
        compressionRatio: "圧縮率",
        download: "ダウンロード",
      },
      common: {
        files: "個",
        bytes: "Bytes",
        kb: "KB",
        mb: "MB",
        gb: "GB",
        px: "px",
      },
    },
  },
  en: {
    translation: {
      app: {
        title: "Image Converter",
        description: "Convert images to various formats",
      },
      header: {
        title: "Image Converter",
        github: "GitHub",
      },
      navigation: {
        top: "Top",
        crop: "Crop",
        convert: "Convert",
      },
      home: {
        title: "Welcome to Image Converter",
        subtitle:
          "Transform your images with ease. Convert between formats, resize, and optimize your images with our powerful online tool.",
        startConverting: "Start Converting",
        tryCropTool: "Try Crop Tool",
        viewOnGithub: "View on GitHub",
        features: {
          formatConversion: {
            title: "Format Conversion",
            description:
              "Convert between JPEG, PNG, WebP and other popular image formats with high quality preservation.",
          },
          imageCropping: {
            title: "Image Cropping",
            description:
              "Crop and resize your images to perfect dimensions with our intuitive cropping tool.",
          },
          batchProcessing: {
            title: "Batch Processing",
            description:
              "Process multiple images at once and download them as a convenient ZIP file.",
          },
        },
      },
      convert: {
        title: "Conversion Settings",
        targetFormat: "Target Format",
        qualitySettings: "Quality Settings",
        quality: "Quality (%)",
        imageSize: "Image Size (Optional)",
        width: "Width (px)",
        height: "Height (px)",
        maintainAspectRatio: "Maintain aspect ratio",
        convert: "Convert",
        converting: "Converting...",
        pleaseSelectFiles: "Please select files to convert",
        conversionError: "An error occurred during conversion.",
        auto: "Auto",
        pngQualityNotice:
          "PNG format uses lossless compression, so quality settings are not applied. Output is always at maximum quality.",
        pngQualityExperimental:
          "Experimental PNG quality control is supported. Lower values result in smaller file sizes but may reduce image quality.",
        pngQualityHelp:
          "PNG Quality: 95+=Standard PNG, 70-94=Medium compression, <70=High compression (quality loss)",
        qualityDescription:
          "Quality: Lower values result in smaller file sizes but reduced image quality",
      },
      crop: {
        title: "Image Cropping Tool",
        subtitle: "Crop and resize your images to perfect dimensions",
        preview: "Preview",
        processing: "Processing...",
        downloadCroppedImage: "Download Cropped Image",
        selectNewImage: "Select New Image",
        imageDetails: "Image Details",
        fileName: "File Name",
        fileSize: "File Size",
        fileType: "File Type",
      },
      fileUpload: {
        dropFiles: "Drop files here",
        dropMoreFiles: "Drop more files to add",
        clickToSelect: "Or click to select files",
        filesSelected: "files selected",
        selectedFiles: "Selected Files",
        add: "Add",
        clearList: "Clear List",
        dragDropLabel: "Drag & Drop Images",
        dropFilesHere: "Drop files here",
        viewDetails: "View details for",
      },
      fileDetails: {
        title: "File Details",
        basicInfo: "Basic Information",
        fileName: "File Name",
        fileSize: "File Size",
        fileFormat: "File Format",
        lastModified: "Last Modified",
        imageSize: "Image Size",
        exifInfo: "EXIF Information",
        unknown: "Unknown",
        loading: "Loading...",
        cannotPreview: "Cannot preview",
        close: "Close",
      },
      progress: {
        converting: "Converting...",
        pleaseWait: "Converting files. Please wait...",
      },
      results: {
        title: "Conversion Results",
        files: "files",
        downloadZip: "Download as ZIP",
        creating: "Creating...",
        clear: "Clear",
        originalSize: "Original Size",
        convertedSize: "Converted Size",
        compressionRatio: "Compression Ratio",
        download: "Download",
      },
      common: {
        files: "",
        bytes: "Bytes",
        kb: "KB",
        mb: "MB",
        gb: "GB",
        px: "px",
      },
    },
  },
};

// i18nextの設定（初期化を実行）
i18n.use(initReactI18next);

// 即座に初期化を実行
if (!i18n.isInitialized) {
  i18n.init({
    resources,
    lng: "ja", // デフォルトは日本語
    fallbackLng: "en",
    interpolation: {
      escapeValue: false,
    },
    react: {
      useSuspense: false, // React 19との互換性のため
    },
  });
}

export const initI18n = () => {
  // 既に初期化済みの場合は何もしない
  return Promise.resolve();
};

export default i18n;
