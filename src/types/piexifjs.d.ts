declare module "piexifjs" {
  interface ExifObj {
    "0th"?: { [key: number]: string | number | number[] };
    Exif?: { [key: number]: string | number | number[] };
    GPS?: { [key: number]: string | number | number[] };
    Interop?: { [key: number]: string | number | number[] };
    "1st"?: { [key: number]: string | number | number[] };
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

  const ImageIFD: ImageIFD;
  const ExifIFD: ExifIFD;
  const GPSIFD: GPSIFD;
  const InteropIFD: InteropIFD;

  function load(data: string): ExifObj;
  function dump(exifObj: ExifObj): string;
  function insert(exif: string, data: string): string;
  function remove(data: string): string;
}
