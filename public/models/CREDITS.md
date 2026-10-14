# Bundled Model Credits / 同梱モデルのクレジット

## realesr-general-x4v3.onnx

AI upscaling model used by the `/upscale` tool. All inference runs locally in the
browser (ONNX Runtime Web); images are never uploaded.

`/upscale` ツールが使用する AI 超解像モデルです。推論はすべてブラウザ内
（ONNX Runtime Web）で実行され、画像がサーバーへ送信されることはありません。

- **Source / 出所**: [xinntao/Real-ESRGAN](https://github.com/xinntao/Real-ESRGAN)
  official release
  [v0.2.5.0 — `realesr-general-x4v3.pth`](https://github.com/xinntao/Real-ESRGAN/releases/download/v0.2.5.0/realesr-general-x4v3.pth)
  (SHA-256: `8dc7edb9ac80ccdc30c3a5dca6616509367f05fbc184ad95b731f05bece96292`)
- **Architecture / アーキテクチャ**: SRVGGNetCompact (num_feat=64, num_conv=32, 4x)
- **License / ライセンス**: **BSD 3-Clause** — same as the Real-ESRGAN project.
  See [Real-ESRGAN LICENSE](https://github.com/xinntao/Real-ESRGAN/blob/master/LICENSE).
  The trained weights are distributed by the Real-ESRGAN authors under the
  project license.
  （Real-ESRGAN プロジェクトと同じ **BSD 3-Clause**。学習済み重みは Real-ESRGAN
  作者がプロジェクトライセンスの下で配布しているものです。）

### Conversion / 変換手順

Converted from the official PyTorch weights to ONNX (opset 17, dynamic H/W axes,
fp32) with `torch.onnx.export`. The architecture definition matches
`realesrgan/archs/srvgg_arch.py` (standalone re-definition, no basicsr
dependency). The exported model was verified against the PyTorch output
(max abs diff < 1e-4 on random input, dynamic-shape inference checked).

公式 PyTorch 重みから `torch.onnx.export` で ONNX（opset 17・H/W 動的軸・fp32）へ
変換しています。アーキテクチャ定義は `realesrgan/archs/srvgg_arch.py` と同一
（basicsr 非依存のスタンドアロン再定義）。変換後、PyTorch 出力との一致
（ランダム入力で最大絶対誤差 < 1e-4）と動的形状での推論を検証済みです。

## u2netp.onnx

AI background-removal (salient object segmentation) model used by the
`/remove-bg` tool. All inference runs locally in the browser (ONNX Runtime
Web); images are never uploaded.

`/remove-bg` ツールが使用する AI 背景除去（顕著物体セグメンテーション）モデルです。
推論はすべてブラウザ内（ONNX Runtime Web）で実行され、画像がサーバーへ送信される
ことはありません。

- **Source / 出所**: ONNX export distributed by
  [danielgatis/rembg](https://github.com/danielgatis/rembg) release
  [v0.0.0 — `u2netp.onnx`](https://github.com/danielgatis/rembg/releases/download/v0.0.0/u2netp.onnx)
  (SHA-256: `309c8469258dda742793dce0ebea8e6dd393174f89934733ecc8b14c76f4ddd8`)
- **Architecture / アーキテクチャ**: U²-Net small (u2netp, 1.13M parameters)
  from [xuebinqin/U-2-Net](https://github.com/xuebinqin/U-2-Net)
- **License / ライセンス**: **Apache-2.0** — same as the upstream U²-Net
  project, which distributes both the architecture and the trained `u2netp`
  weights. See [U-2-Net LICENSE](https://github.com/xuebinqin/U-2-Net/blob/master/LICENSE).
  （上流の U²-Net プロジェクトと同じ **Apache-2.0**。アーキテクチャと学習済み
  `u2netp` 重みは U²-Net 作者がこのライセンスの下で配布しているものです。）
- **Input / 入力**: NCHW fp32 `(1, 3, 320, 320)`, values scaled to 0..1 then
  normalized with ImageNet mean `[0.485, 0.456, 0.406]` / std
  `[0.229, 0.224, 0.225]`
- **Output / 出力**: saliency map `(1, 1, 320, 320)`; min-max normalized and
  bilinearly resized back to the source resolution, then applied as alpha
  （サリエンシーマップを min-max 正規化 → 元解像度へバイリニア拡大 → アルファ
  として合成）

## version-RFB-640.onnx

Face detection model used by the auto-detect feature of the Image Studio
retouch tool (`/studio`). All inference runs locally in the browser (ONNX
Runtime Web); images are never uploaded.

Image Studio（`/studio`）レタッチツールの自動検出機能が使用する顔検出モデルです。
推論はすべてブラウザ内（ONNX Runtime Web）で実行され、画像がサーバーへ送信される
ことはありません。

- **Source / 出所**: ONNX export distributed by the
  [ONNX Model Zoo](https://github.com/onnx/models)
  ([`validated/vision/body_analysis/ultraface/models/version-RFB-640.onnx`](https://github.com/onnx/models/blob/main/validated/vision/body_analysis/ultraface/models/version-RFB-640.onnx))
  (SHA-256: `8f4c659275977e7a3bfbfa339a9c769ad793df50f9c0baa8c14b11baa1646430`)
- **Architecture / アーキテクチャ**: Ultra-Light-Fast-Generic-Face-Detector-1MB
  (UltraFace, RFB-640 variant) from
  [Linzaer/Ultra-Light-Fast-Generic-Face-Detector-1MB](https://github.com/Linzaer/Ultra-Light-Fast-Generic-Face-Detector-1MB)
- **License / ライセンス**: **MIT** — same as the upstream UltraFace project;
  the ONNX Model Zoo distributes this model under MIT
  (`SPDX-License-Identifier: MIT`).
  （上流の UltraFace プロジェクトと同じ **MIT**。ONNX Model Zoo も MIT として
  配布しています。）
- **Input / 入力**: NCHW fp32 `(1, 3, 480, 640)`, RGB, normalized as
  `(pixel - 127) / 128`
- **Output / 出力**: `scores (1, 17640, 2)` (softmax probabilities) and
  `boxes (1, 17640, 4)` (corner-form `[x1, y1, x2, y2]`, normalized 0..1);
  score-thresholded and merged with NMS
  （スコアしきい値 → NMS で確定）

## license_plate_detection_lpd_yunet_2023mar.onnx

License plate detection model used by the auto-detect feature of the Image
Studio retouch tool (`/studio`). All inference runs locally in the browser
(ONNX Runtime Web); images are never uploaded.

Image Studio（`/studio`）レタッチツールの自動検出機能が使用するナンバープレート
検出モデルです。推論はすべてブラウザ内（ONNX Runtime Web）で実行され、画像が
サーバーへ送信されることはありません。

- **Source / 出所**: [opencv/opencv_zoo](https://github.com/opencv/opencv_zoo)
  ([`models/license_plate_detection_yunet/license_plate_detection_lpd_yunet_2023mar.onnx`](https://github.com/opencv/opencv_zoo/blob/main/models/license_plate_detection_yunet/license_plate_detection_lpd_yunet_2023mar.onnx))
  (SHA-256: `6d4978a7b6d25514d5e24811b82bfb511d166bdd8ca3b03aa63c1623d4d039c7`)
- **Architecture / アーキテクチャ**: LPD-YuNet (YuNet-based license plate
  detector, trained on CCPD). Provided to opencv_zoo by Dong Wang / Shiqi Yu
  (SYSTEM TEAM, Southern University of Science and Technology)
- **License / ライセンス**: **Apache-2.0** — see
  [models/license_plate_detection_yunet/LICENSE](https://github.com/opencv/opencv_zoo/blob/main/models/license_plate_detection_yunet/LICENSE)
- **Input / 入力**: NCHW fp32 `(1, 3, 240, 320)`, BGR, raw 0..255
  (OpenCV `blobFromImage` default; no mean subtraction / scaling)
- **Output / 出力**: `loc (4385, 14)` / `conf (4385, 2)` / `iou (4385, 1)`;
  decoded with SSD-style priors (strides 8/16/32/64) into 4 corner points,
  then converted to axis-aligned boxes, score = `sqrt(cls * iou)`, merged
  with NMS（プライア復号 → 四隅点 → 外接矩形 → NMS）
- **Note / 注記**: trained on CCPD (Chinese City Parking Dataset); detection
  accuracy for non-Chinese license plates may be lower
  （CCPD（中国のナンバープレート）で学習されており、他地域のプレートでは精度が
  下がる場合があります）
