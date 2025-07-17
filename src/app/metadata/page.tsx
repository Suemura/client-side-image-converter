"use client";

import React, { useState, useCallback, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Header } from "../../components/Header";
import { LayoutContainer } from "../../components/LayoutContainer";
import { MainContent } from "../../components/MainContent";
import { Button } from "../../components/Button";
import { ImageUploadSection } from "../convert/components/ImageUploadSection";
import { FileDetailModal } from "../../components/FileDetailModal";
import { useMetadataManager } from "../../hooks/useMetadataManager";
import { MetadataManager } from "../../utils/metadataManager";
import { FileDownloader } from "../../utils/fileDownloader";
import styles from "./page.module.css";

export default function MetadataPage() {
  const { t } = useTranslation();
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [selectedFileForModal, setSelectedFileForModal] = useState<File | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [imageUrls, setImageUrls] = useState<Map<string, string>>(new Map());

  const {
    analysis,
    isAnalyzing,
    isProcessing,
    selectedTags,
    progressCurrent,
    progressTotal,
    analyzeFiles,
    toggleTag,
    selectAllPrivacyTags,
    clearSelection,
    removeSelectedMetadata
  } = useMetadataManager();

  // ファイル選択時の処理
  const handleFilesSelected = useCallback(async (files: File[]) => {
    // 画像ファイルのみをフィルタリング
    const imageFiles = files.filter(file => file.type.startsWith("image/"));
    setSelectedFiles(imageFiles);
    
    // 既存のURLをクリーンアップ
    imageUrls.forEach(url => URL.revokeObjectURL(url));
    
    // 新しい画像URLを作成
    const newImageUrls = new Map<string, string>();
    imageFiles.forEach(file => {
      const url = URL.createObjectURL(file);
      newImageUrls.set(file.name, url);
    });
    setImageUrls(newImageUrls);

    // メタデータ分析を実行
    if (imageFiles.length > 0) {
      await analyzeFiles(imageFiles);
    }
  }, [analyzeFiles, imageUrls]);

  const handleClearFiles = useCallback(() => {
    setSelectedFiles([]);
    // URLをクリーンアップ
    imageUrls.forEach(url => URL.revokeObjectURL(url));
    setImageUrls(new Map());
  }, [imageUrls]);

  const handleImageClick = useCallback((file: File) => {
    setSelectedFileForModal(file);
    setIsModalOpen(true);
  }, []);

  const handleCloseModal = useCallback(() => {
    setIsModalOpen(false);
    setSelectedFileForModal(null);
  }, []);

  // メタデータ削除とダウンロード
  const handleRemoveAndDownload = useCallback(async () => {
    if (!analysis || selectedTags.size === 0) return;

    const cleanedFiles = await removeSelectedMetadata();
    if (cleanedFiles.length > 0) {
      // クリーニング済みファイルをダウンロード
      if (cleanedFiles.length === 1) {
        FileDownloader.downloadFile(cleanedFiles[0], `cleaned_${cleanedFiles[0].name}`);
      } else {
        await FileDownloader.downloadMultipleFiles(cleanedFiles, "cleaned_images");
      }
    }
  }, [analysis, selectedTags, removeSelectedMetadata]);

  // クリーンアップ
  useEffect(() => {
    return () => {
      imageUrls.forEach(url => URL.revokeObjectURL(url));
    };
  }, [imageUrls]);

  // プライバシーリスクの表示
  const getPrivacyRiskBadge = (file: File) => {
    if (!analysis) return null;
    
    const fileMetadata = analysis.fileMetadata.find(fm => fm.file.name === file.name);
    if (!fileMetadata) return null;
    
    const risk = MetadataManager.assessPrivacyRisk(fileMetadata.exifData);
    const riskClass = risk === 'high' ? styles.privacyRiskHigh : 
                     risk === 'medium' ? styles.privacyRiskMedium : 
                     styles.privacyRiskLow;
    
    return (
      <span className={`${styles.privacyRiskBadge} ${riskClass}`}>
        {t(`metadata.risk.${risk}`, risk.toUpperCase())}
      </span>
    );
  };

  // ファイル形式によるメタデータ処理方法を表示
  const getProcessingMethodBadge = (file: File) => {
    const isJpeg = file.type.includes('jpeg') || file.type.includes('jpg');
    const badgeClass = isJpeg ? styles.processingMethodSelective : styles.processingMethodAll;
    const textKey = isJpeg ? 'metadata.processingMethod.selective' : 'metadata.processingMethod.allRemoval';
    
    return (
      <span className={`${styles.processingMethodBadge} ${badgeClass}`}>
        {t(textKey)}
      </span>
    );
  };

  // タグの使用カウントを取得
  const getTagCount = (tag: string): number => {
    if (!analysis) return 0;
    return analysis.fileMetadata.filter(fm => 
      Object.keys(fm.exifData).includes(tag)
    ).length;
  };

  return (
    <LayoutContainer>
      <Header />
      <MainContent>
        <div className={styles.pageContainer}>
          <h1 className={styles.pageTitle}>
            {t("metadata.title")}
          </h1>
          <p className={styles.pageSubtitle}>
            {t("metadata.subtitle")}
          </p>

          <ImageUploadSection
            files={selectedFiles}
            onFilesSelected={handleFilesSelected}
            onClearFiles={handleClearFiles}
            showFileList={false}
          />

          {selectedFiles.length > 0 && (
            <div className={styles.contentGrid}>
              {/* 左カラム: 画像一覧 */}
              <div className={styles.section}>
                <h2 className={styles.sectionTitle}>
                  {t("metadata.uploadedImages")} ({selectedFiles.length})
                </h2>
                
                <div className={styles.imagesGrid}>
                  {selectedFiles.map((file, index) => (
                    <div
                      key={`${file.name}-${index}`}
                      className={styles.imageCard}
                      onClick={() => handleImageClick(file)}
                    >
                      <div className={styles.imagePreview}>
                        <img
                          src={imageUrls.get(file.name) || ''}
                          alt={file.name}
                        />
                      </div>
                      <p className={styles.imageFileName}>
                        {file.name}
                      </p>
                      <div className={styles.imageBadges}>
                        {getPrivacyRiskBadge(file)}
                        {getProcessingMethodBadge(file)}
                      </div>
                      <p className={styles.imageFileSize}>
                        {(file.size / 1024 / 1024).toFixed(2)} MB
                      </p>
                    </div>
                  ))}
                </div>
              </div>

              {/* 右カラム: メタデータ管理 */}
              <div className={styles.section}>
                <h2 className={styles.sectionTitle}>
                  {t("metadata.metadataAnalysis")}
                </h2>

                {isAnalyzing ? (
                  <div className={styles.loadingState}>
                    <div className={styles.loadingSpinner}></div>
                    <p>{t("metadata.analyzingMetadata")}</p>
                  </div>
                ) : analysis ? (
                  <>
                    {/* プライバシーリスクタグ */}
                    {analysis.privacyRiskTags.size > 0 && (
                      <div style={{ marginBottom: "24px" }}>
                        <h3 style={{ fontSize: "16px", fontWeight: "600", marginBottom: "12px", color: "var(--foreground)" }}>
                          {t("metadata.privacyRiskTags")} ({analysis.privacyRiskTags.size})
                        </h3>
                        <div className={styles.tagsList} style={{ maxHeight: "200px" }}>
                          {Array.from(analysis.privacyRiskTags).map(tag => (
                            <div key={tag} className={styles.tagItem}>
                              <input
                                type="checkbox"
                                className={styles.tagCheckbox}
                                checked={selectedTags.has(tag)}
                                onChange={() => toggleTag(tag)}
                              />
                              <span className={`${styles.tagName} ${styles.privacyTag}`}>
                                {tag}
                              </span>
                              <span className={styles.tagCount}>
                                {getTagCount(tag)}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* すべてのタグ */}
                    <div>
                      <h3 style={{ fontSize: "16px", fontWeight: "600", marginBottom: "12px", color: "var(--foreground)" }}>
                        {t("metadata.allExifTags")} ({analysis.allTags.size})
                      </h3>
                      <div className={styles.tagsList}>
                        {Array.from(analysis.allTags).sort().map(tag => (
                          <div key={tag} className={styles.tagItem}>
                            <input
                              type="checkbox"
                              className={styles.tagCheckbox}
                              checked={selectedTags.has(tag)}
                              onChange={() => toggleTag(tag)}
                            />
                            <span className={styles.tagName}>
                              {tag}
                            </span>
                            <span className={styles.tagCount}>
                              {getTagCount(tag)}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* 動作説明 */}
                    <div style={{ marginBottom: "16px", padding: "12px", backgroundColor: "var(--muted)", borderRadius: "8px" }}>
                      <p style={{ fontSize: "14px", color: "var(--muted-foreground)", margin: 0 }}>
                        {t("metadata.processingNote")}
                      </p>
                    </div>


                    {/* アクションボタン */}
                    <div className={styles.actionButtons}>
                      <Button
                        variant="secondary"
                        onClick={selectAllPrivacyTags}
                        disabled={analysis.privacyRiskTags.size === 0}
                      >
                        リスクタグを選択
                      </Button>
                      <Button
                        variant="secondary"
                        onClick={clearSelection}
                        disabled={selectedTags.size === 0}
                      >
                        選択クリア
                      </Button>
                      <Button
                        variant="primary"
                        onClick={handleRemoveAndDownload}
                        disabled={selectedTags.size === 0 || isProcessing}
                      >
                        {isProcessing ? t("metadata.processing") : t("metadata.downloadCleanedImages")}
                      </Button>
                    </div>
                  </>
                ) : (
                  <div className={styles.emptyState}>
                    <p>{t("metadata.selectTagsToRemove")}</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* 処理中オーバーレイ */}
          {isProcessing && (
            <div className={styles.processingOverlay}>
              <div className={styles.processingModal}>
                <h3 className={styles.processingTitle}>
                  {t("metadata.processing")}
                </h3>
                <p className={styles.progressInfo}>
                  {progressCurrent} / {progressTotal} ファイル
                </p>
                <div className={styles.progressBar}>
                  <div 
                    className={styles.progressFill}
                    style={{ 
                      width: progressTotal > 0 ? `${(progressCurrent / progressTotal) * 100}%` : '0%' 
                    }}
                  />
                </div>
              </div>
            </div>
          )}

          {/* ファイル詳細モーダル */}
          {selectedFileForModal && (
            <FileDetailModal
              file={selectedFileForModal}
              isOpen={isModalOpen}
              onClose={handleCloseModal}
            />
          )}
        </div>
      </MainContent>
    </LayoutContainer>
  );
}