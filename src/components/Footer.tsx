import type React from "react";
import { useTranslation } from "react-i18next";
import styles from "./Footer.module.css";

export const Footer: React.FC = () => {
  const { t } = useTranslation();
  const currentYear = new Date().getFullYear();

  return (
    <footer className={styles.footer}>
      <div className={styles.container}>
        {/* 上段 */}
        <div className={styles.topSection}>
          <div className={styles.privacySection}>
            <div className={styles.privacyIcon}>
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <rect x="3" y="11" width="18" height="10" rx="2" ry="2" />
                <path d="M7 11V7a5 5 0 0110 0v4" />
              </svg>
            </div>
            <p className={styles.privacyText}>{t("footer.privacyMessage")}</p>
          </div>
          <div className={styles.linksSection}>
            <div className={styles.linkGroup}>
              <h4 className={styles.linkTitle}>{t("footer.project")}</h4>
              <a
                href="https://github.com/Suemura/client-side-image-converter"
                target="_blank"
                rel="noopener noreferrer"
                className={styles.link}
              >
                {t("footer.github")}
              </a>
              <a
                href="https://github.com/Suemura/client-side-image-converter/issues"
                target="_blank"
                rel="noopener noreferrer"
                className={styles.link}
              >
                {t("footer.reportIssue")}
              </a>
            </div>
            <div className={styles.linkGroup}>
              <h4 className={styles.linkTitle}>{t("footer.resources")}</h4>
              <a
                href="https://github.com/Suemura/client-side-image-converter#readme"
                target="_blank"
                rel="noopener noreferrer"
                className={styles.link}
              >
                {t("footer.documentation")}
              </a>
              <a
                href="https://github.com/Suemura/client-side-image-converter/blob/main/LICENSE"
                target="_blank"
                rel="noopener noreferrer"
                className={styles.link}
              >
                {t("footer.license")}
              </a>
            </div>
          </div>
        </div>

        {/* 下段 */}
        <div className={styles.bottomSection}>
          <p className={styles.copyright}>
            © {currentYear} Client-Side Image Converter.{" "}
            {t("footer.allRightsReserved")}
          </p>
        </div>
      </div>
    </footer>
  );
};
