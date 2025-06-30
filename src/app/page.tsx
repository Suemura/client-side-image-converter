"use client";

import Link from "next/link";
import React from "react";
import { Button } from "../components/Button";
import { Header } from "../components/Header";
import { LayoutContainer } from "../components/LayoutContainer";
import { MainContent } from "../components/MainContent";

export default function Home() {
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
            Welcome to Image Converter
          </h1>
          <p
            style={{
              fontSize: "1.25rem",
              color: "var(--muted-foreground)",
              maxWidth: "600px",
              lineHeight: "1.6",
            }}
          >
            Transform your images with ease. Convert between formats, resize,
            and optimize your images with our powerful online tool.
          </p>
          <div style={{ display: "flex", gap: "1rem", marginTop: "2rem" }}>
            <Link href="/convert">
              <Button variant="primary" size="large">
                Start Converting
              </Button>
            </Link>
            <Link href="/crop">
              <Button variant="secondary" size="large">
                Try Crop Tool
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
                Format Conversion
              </h3>
              <p
                style={{
                  color: "var(--muted-foreground)",
                  lineHeight: "1.6",
                }}
              >
                Convert between JPEG, PNG, WebP and other popular image formats
                with high quality preservation.
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
                Image Cropping
              </h3>
              <p
                style={{
                  color: "var(--muted-foreground)",
                  lineHeight: "1.6",
                }}
              >
                Crop and resize your images to perfect dimensions with our
                intuitive cropping tool.
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
                Batch Processing
              </h3>
              <p
                style={{
                  color: "var(--muted-foreground)",
                  lineHeight: "1.6",
                }}
              >
                Process multiple images at once and download them as a
                convenient ZIP file.
              </p>
            </div>
          </div>
        </div>
      </MainContent>
    </LayoutContainer>
  );
}
