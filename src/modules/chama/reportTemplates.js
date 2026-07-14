/**
 * reportTemplates.js
 * Advanced Welfare PDF Templates
 * Shared by WelfareReportPDF.js
 */

// ─────────────────────────────────────────────
// GLOBAL COLOURS
// ─────────────────────────────────────────────

export const COLOURS = {
  white: [255, 255, 255],
  black: [15, 23, 42],

  border: [203, 213, 225],
  neutralAccent: [100, 116, 139],

  success: [16, 185, 129],
  warning: [245, 158, 11],
  danger: [239, 68, 68],
  info: [59, 130, 246],
};

// ─────────────────────────────────────────────
// PDF STYLES
// ─────────────────────────────────────────────

export const PDF_STYLES = {
  headerFontSize: 18,
  bodyFontSize: 10,
  footerFontSize: 9,
  margin: 14,
};

// ─────────────────────────────────────────────
// TEMPLATE FACTORY
// ─────────────────────────────────────────────

export const getWelfareTemplate = (eventType = "other") => {
  const type = String(eventType).toLowerCase();

  const templates = {
    funeral: {
      tone: "empathy",

      colours: {
        primary: [51, 65, 85],
        accent: [79, 70, 229],
        background: [241, 245, 249],
      },

      header: {
        title: "In Loving Memory & Solidarity",
        subtitle:
          "Standing together to support the bereaved family.",
        badge: "Funeral Support",
      },

      body: {
        purposeText:
          "This report documents welfare contributions made by members in support of the bereaved family. The welfare fund exists to provide financial and emotional support during difficult moments within our community.",

        sectionLabel: "Approved Contributions",

        tableCaption:
          "Verified welfare contributions received and approved.",
      },

      footer: {
        closing:
          "We extend our heartfelt condolences and appreciation to all members who contributed. May this support provide comfort and strength during this difficult period.",

        tagline:
          "Together in Compassion, Together in Strength.",

        signoff:
          "Prepared by Welfare Department",
      },
    },

    sickness: {
      tone: "empathy",

      colours: {
        primary: [22, 101, 52],
        accent: [16, 185, 129],
        background: [240, 253, 244],
      },

      header: {
        title: "Wishing You a Speedy Recovery",
        subtitle:
          "Supporting members through health challenges.",
        badge: "Medical Support",
      },

      body: {
        purposeText:
          "This report outlines welfare support mobilized to assist a member facing medical challenges. Contributions demonstrate the community's commitment to care and recovery.",

        sectionLabel: "Approved Contributions",

        tableCaption:
          "Medical welfare contributions received.",
      },

      footer: {
        closing:
          "We wish the beneficiary strength, healing, and a full recovery. Thank you to all members who stood together in support.",

        tagline:
          "Health, Hope and Community Support.",

        signoff:
          "Prepared by Welfare Department",
      },
    },

    wedding: {
      tone: "celebration",

      colours: {
        primary: [124, 58, 237],
        accent: [168, 85, 247],
        background: [250, 245, 255],
      },

      header: {
        title: "Celebrating Your Joyous Union",
        subtitle:
          "Sharing in your happiness and new beginning.",
        badge: "Wedding Celebration",
      },

      body: {
        purposeText:
          "This report captures contributions made in celebration of a member's wedding and the collective goodwill extended by fellow members.",

        sectionLabel: "Celebration Contributions",

        tableCaption:
          "Wedding celebration contributions received.",
      },

      footer: {
        closing:
          "May this new chapter be filled with love, joy, prosperity and lifelong happiness.",

        tagline:
          "Celebrating Milestones Together.",

        signoff:
          "Prepared by Welfare Department",
      },
    },

    achievement: {
      tone: "celebration",

      colours: {
        primary: [21, 128, 61],
        accent: [34, 197, 94],
        background: [240, 253, 244],
      },

      header: {
        title: "Celebrating Outstanding Achievement",
        subtitle:
          "Recognising excellence and success.",
        badge: "Achievement Award",
      },

      body: {
        purposeText:
          "This report records contributions and support provided in recognition of a member's notable achievement and success.",

        sectionLabel: "Recognition Contributions",

        tableCaption:
          "Achievement support contributions received.",
      },

      footer: {
        closing:
          "We celebrate this achievement and encourage continued excellence and growth.",

        tagline:
          "Success Shared Is Success Multiplied.",

        signoff:
          "Prepared by Welfare Department",
      },
    },

    other: {
      tone: "neutral",

      colours: {
        primary: [30, 41, 59],
        accent: [59, 130, 246],
        background: [248, 250, 252],
      },

      header: {
        title: "Community Welfare Report",
        subtitle:
          "Supporting members through shared responsibility.",
        badge: "Welfare Support",
      },

      body: {
        purposeText:
          "This report summarizes welfare contributions and support activities undertaken by members of the chama.",

        sectionLabel: "Contributions",

        tableCaption:
          "Recorded welfare contributions.",
      },

      footer: {
        closing:
          "Thank you to all members for demonstrating unity, generosity and commitment to community welfare.",

        tagline:
          "Together We Rise.",

        signoff:
          "Prepared by Welfare Department",
      },
    },
  };

  return templates[type] || templates.other;
};

// Backward compatibility
export const getTemplate = getWelfareTemplate;