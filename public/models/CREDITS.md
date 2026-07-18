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
