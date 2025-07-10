"use client";

import Link from "next/link";
import React from "react";
import { Trans, useTranslation } from "react-i18next";
import { Button } from "../components/Button";
import { Header } from "../components/Header";
import { LayoutContainer } from "../components/LayoutContainer";
import { MainContent } from "../components/MainContent";
import styles from "./page.module.css";

export default function Home() {
  const { t } = useTranslation();

  return (
    <LayoutContainer>
      <Header />
      <MainContent>
        <div className={styles.container}>
          <h1 className={styles.title}>{t("home.title")}</h1>
          <p className={styles.subtitle}>{t("home.subtitle")}</p>
          <div className={styles.buttonContainer}>
            <Link href="/convert">
              <Button variant="primary" size="large">
                {t("home.startConverting")}
              </Button>
            </Link>
            <Link href="/crop">
              <Button variant="secondary" size="large">
                {t("home.tryCropTool")}
              </Button>
            </Link>
          </div>

          {/* GitHubリンク */}
          <div className={styles.githubContainer}>
            <a
              href="https://github.com/suemura/client-side-image-converter"
              target="_blank"
              rel="noopener noreferrer"
              className={styles.githubLink}
            >
              <svg className={styles.githubIcon} viewBox="0 0 24 24">
                <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
              </svg>
              {t("home.viewOnGithub")}
            </a>
          </div>

          {/* 特徴セクション */}
          <div className={styles.featuresGrid}>
            <div className={styles.featureCard}>
              {/* フォーマット変換アイコン */}
              <img
                className={styles.featureIcon}
                src="icon_convert.svg"
                alt="フォーマット変換アイコン"
              />
              <h3 className={styles.featureTitle}>
                {t("home.features.formatConversion.title")}
              </h3>
              <p className={styles.featureDescription}>
                {t("home.features.formatConversion.description")}
              </p>
            </div>

            <div className={styles.featureCard}>
              {/* 画像クロップアイコン */}
              <img
                className={styles.featureIcon}
                src="icon_crop.svg"
                alt="画像クロップアイコン"
              />
              <h3 className={styles.featureTitle}>
                {t("home.features.imageCropping.title")}
              </h3>
              <p className={styles.featureDescription}>
                {t("home.features.imageCropping.description")}
              </p>
            </div>

            <div className={styles.featureCard}>
              {/* バッチ処理アイコン */}
              <img
                className={styles.featureIcon}
                src="icon_batch.svg"
                alt="バッチ処理アイコン"
              />
              <h3 className={styles.featureTitle}>
                {t("home.features.batchProcessing.title")}
              </h3>
              <p className={styles.featureDescription}>
                {t("home.features.batchProcessing.description")}
              </p>
            </div>
          </div>
        </div>
      </MainContent>
    </LayoutContainer>
  );
}
