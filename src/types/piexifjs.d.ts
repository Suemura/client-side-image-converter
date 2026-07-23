declare module "piexifjs" {
  // EXIF の有理数は [分子, 分母] のペアで表現される（例: 露出時間）。
  // GPS 座標（度・分・秒）のようにペアの配列を取るタグもあるため number[][] も許容する
  type ExifValue = string | number | number[] | number[][];

  interface ExifObj {
    "0th"?: { [key: number]: ExifValue };
    Exif?: { [key: number]: ExifValue };
    GPS?: { [key: number]: ExifValue };
    Interop?: { [key: number]: ExifValue };
    "1st"?: { [key: number]: ExifValue };
    thumbnail?: string | null;
  }

  interface ImageIFD {
    Make: number;
    Model: number;
    Orientation: number;
    XResolution: number;
    YResolution: number;
    ResolutionUnit: number;
    Software: number;
    DateTime: number;
    YCbCrPositioning: number;
    ExifTag: number;
    GPSTag: number;
    Artist: number;
    Copyright: number;
  }

  interface ExifIFD {
    ExposureTime: number;
    FNumber: number;
    ExposureProgram: number;
    SpectralSensitivity: number;
    ISOSpeedRatings: number;
    OECF: number;
    ExifVersion: number;
    DateTimeOriginal: number;
    DateTimeDigitized: number;
    ComponentsConfiguration: number;
    CompressedBitsPerPixel: number;
    ShutterSpeedValue: number;
    ApertureValue: number;
    BrightnessValue: number;
    ExposureBiasValue: number;
    MaxApertureValue: number;
    SubjectDistance: number;
    MeteringMode: number;
    LightSource: number;
    Flash: number;
    FocalLength: number;
    SubjectArea: number;
    MakerNote: number;
    UserComment: number;
    SubSecTime: number;
    SubSecTimeOriginal: number;
    SubSecTimeDigitized: number;
    FlashpixVersion: number;
    ColorSpace: number;
    PixelXDimension: number;
    PixelYDimension: number;
    RelatedSoundFile: number;
    InteroperabilityTag: number;
    FlashEnergy: number;
    SpatialFrequencyResponse: number;
    FocalPlaneXResolution: number;
    FocalPlaneYResolution: number;
    FocalPlaneResolutionUnit: number;
    SubjectLocation: number;
    ExposureIndex: number;
    SensingMethod: number;
    FileSource: number;
    SceneType: number;
    CFAPattern: number;
    CustomRendered: number;
    ExposureMode: number;
    WhiteBalance: number;
    DigitalZoomRatio: number;
    FocalLengthIn35mmFilm: number;
    SceneCaptureType: number;
    GainControl: number;
    Contrast: number;
    Saturation: number;
    Sharpness: number;
    DeviceSettingDescription: number;
    SubjectDistanceRange: number;
    ImageUniqueID: number;
    CameraOwnerName: number;
    BodySerialNumber: number;
    LensSpecification: number;
    LensMake: number;
    LensModel: number;
    LensSerialNumber: number;
  }

  interface GPSIFD {
    // GPS タグ名（文字列）からタグ ID を引く用途（metadataManager の GPS 一括削除）。
    // 全 GPS タグ ID は number のため、名前引きを型安全に許可する索引シグネチャを持たせる
    [tagName: string]: number;
    GPSVersionID: number;
    GPSLatitudeRef: number;
    GPSLatitude: number;
    GPSLongitudeRef: number;
    GPSLongitude: number;
    GPSAltitudeRef: number;
    GPSAltitude: number;
    GPSTimeStamp: number;
    GPSSatellites: number;
    GPSStatus: number;
    GPSMeasureMode: number;
    GPSDOP: number;
    GPSSpeedRef: number;
    GPSSpeed: number;
    GPSTrackRef: number;
    GPSTrack: number;
    GPSImgDirectionRef: number;
    GPSImgDirection: number;
    GPSMapDatum: number;
    GPSDestLatitudeRef: number;
    GPSDestLatitude: number;
    GPSDestLongitudeRef: number;
    GPSDestLongitude: number;
    GPSDestBearingRef: number;
    GPSDestBearing: number;
    GPSDestDistanceRef: number;
    GPSDestDistance: number;
    GPSProcessingMethod: number;
    GPSAreaInformation: number;
    GPSDateStamp: number;
    GPSDifferential: number;
  }

  interface InteropIFD {
    InteroperabilityIndex: number;
  }

  interface PiexifLibrary {
    ImageIFD: ImageIFD;
    ExifIFD: ExifIFD;
    GPSIFD: GPSIFD;
    InteropIFD: InteropIFD;
    load(data: string): ExifObj;
    dump(exifObj: ExifObj): string;
    insert(exif: string, data: string): string;
    remove(data: string): string;
  }

  // CJS モジュールのため export = で宣言する（exif-js.d.ts と同形式）。
  // esModuleInterop により、静的 default import と動的 import の .default の両方が型付けされる
  const piexif: PiexifLibrary;
  export = piexif;
}
