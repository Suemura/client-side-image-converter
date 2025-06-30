"use client";

import Link from "next/link";
import React from "react";
import { useTranslation } from "react-i18next";
import { Button } from "../components/Button";
import { Header } from "../components/Header";
import { LayoutContainer } from "../components/LayoutContainer";
import { MainContent } from "../components/MainContent";

export default function Home() {
  const { t } = useTranslation();

  return (
    <LayoutContainer>
      <Header />
      <MainContent>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            minHeight: "60vh",
            textAlign: "center",
            gap: "2rem",
            padding: "2rem",
          }}
        >
          <h1
            style={{
              fontSize: "3rem",
              fontWeight: "bold",
              color: "var(--foreground)",
              marginBottom: "1rem",
              letterSpacing: "-0.02em",
            }}
          >
            {t("home.title")}
          </h1>
          <p
            style={{
              fontSize: "1.25rem",
              color: "var(--muted-foreground)",
              maxWidth: "600px",
              lineHeight: "1.6",
            }}
          >
            {t("home.subtitle")}
          </p>
          <div style={{ display: "flex", gap: "1rem", marginTop: "2rem" }}>
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

          {/* 特徴セクション */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
              gap: "2rem",
              marginTop: "4rem",
              width: "100%",
              maxWidth: "1000px",
            }}
          >
            <div
              style={{
                padding: "2rem",
                backgroundColor: "white",
                borderRadius: "12px",
                border: "1px solid var(--border-dashed)",
                textAlign: "center",
              }}
            >
              <h3
                style={{
                  fontSize: "1.5rem",
                  fontWeight: "600",
                  color: "var(--foreground)",
                  marginBottom: "1rem",
                }}
              >
                {t("home.features.formatConversion.title")}
              </h3>
              <p
                style={{
                  color: "var(--muted-foreground)",
                  lineHeight: "1.6",
                }}
              >
                {t("home.features.formatConversion.description")}
              </p>
            </div>

            <div
              style={{
                padding: "2rem",
                backgroundColor: "white",
                borderRadius: "12px",
                border: "1px solid var(--border-dashed)",
                textAlign: "center",
              }}
            >
              <h3
                style={{
                  fontSize: "1.5rem",
                  fontWeight: "600",
                  color: "var(--foreground)",
                  marginBottom: "1rem",
                }}
              >
                {t("home.features.imageCropping.title")}
              </h3>
              <p
                style={{
                  color: "var(--muted-foreground)",
                  lineHeight: "1.6",
                }}
              >
                {t("home.features.imageCropping.description")}
              </p>
            </div>

            <div
              style={{
                padding: "2rem",
                backgroundColor: "white",
                borderRadius: "12px",
                border: "1px solid var(--border-dashed)",
                textAlign: "center",
              }}
            >
              <h3
                style={{
                  fontSize: "1.5rem",
                  fontWeight: "600",
                  color: "var(--foreground)",
                  marginBottom: "1rem",
                }}
              >
                {t("home.features.batchProcessing.title")}
              </h3>
              <p
                style={{
                  color: "var(--muted-foreground)",
                  lineHeight: "1.6",
                }}
              >
                {t("home.features.batchProcessing.description")}
              </p>
            </div>
          </div>
        </div>
      </MainContent>
    </LayoutContainer>
  );
}
