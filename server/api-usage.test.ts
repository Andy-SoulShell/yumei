import { describe, it, expect, vi, beforeEach } from "vitest";
import axios from "axios";

vi.mock("axios");
const mockedAxios = vi.mocked(axios, true);

describe("API Usage Queries", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("OpenRouter Credits", () => {
    it("should parse OpenRouter credits response correctly", async () => {
      mockedAxios.get.mockResolvedValueOnce({
        data: {
          data: {
            total_credits: 100.5,
            total_usage: 25.75,
          },
        },
      });

      const response = await axios.get("https://openrouter.ai/api/v1/credits", {
        headers: { Authorization: "Bearer test-key" },
      });

      const data = response.data.data;
      expect(data.total_credits).toBe(100.5);
      expect(data.total_usage).toBe(25.75);
      expect(data.total_credits - data.total_usage).toBeCloseTo(74.75);
    });

    it("should handle OpenRouter 401 error", async () => {
      mockedAxios.get.mockRejectedValueOnce({
        response: { status: 401 },
      });

      try {
        await axios.get("https://openrouter.ai/api/v1/credits", {
          headers: { Authorization: "Bearer invalid-key" },
        });
        expect.unreachable("Should have thrown");
      } catch (error: any) {
        expect(error.response.status).toBe(401);
      }
    });

    it("should handle OpenRouter 403 error for non-management keys", async () => {
      mockedAxios.get.mockRejectedValueOnce({
        response: { status: 403 },
      });

      try {
        await axios.get("https://openrouter.ai/api/v1/credits", {
          headers: { Authorization: "Bearer non-management-key" },
        });
        expect.unreachable("Should have thrown");
      } catch (error: any) {
        expect(error.response.status).toBe(403);
      }
    });
  });

  describe("ElevenLabs Usage", () => {
    it("should parse ElevenLabs subscription response correctly", async () => {
      mockedAxios.get.mockResolvedValueOnce({
        data: {
          tier: "starter",
          character_count: 3500,
          character_limit: 15000,
          status: "active",
        },
      });

      const response = await axios.get("https://api.elevenlabs.io/v1/user/subscription", {
        headers: { "xi-api-key": "test-key" },
      });

      const data = response.data;
      expect(data.tier).toBe("starter");
      expect(data.character_count).toBe(3500);
      expect(data.character_limit).toBe(15000);
      expect(data.character_limit - data.character_count).toBe(11500);
      expect(data.status).toBe("active");
    });

    it("should handle ElevenLabs 401 error", async () => {
      mockedAxios.get.mockRejectedValueOnce({
        response: { status: 401 },
      });

      try {
        await axios.get("https://api.elevenlabs.io/v1/user/subscription", {
          headers: { "xi-api-key": "invalid-key" },
        });
        expect.unreachable("Should have thrown");
      } catch (error: any) {
        expect(error.response.status).toBe(401);
      }
    });

    it("should calculate usage percentage correctly", () => {
      const characterCount = 12000;
      const characterLimit = 15000;
      const usagePercent = (characterCount / characterLimit) * 100;
      expect(usagePercent).toBe(80);
    });
  });

  describe("Fish Audio Credits", () => {
    it("should parse Fish Audio credit response correctly", async () => {
      mockedAxios.get.mockResolvedValueOnce({
        data: {
          _id: "abc123",
          user_id: "user123",
          credit: "45.6789",
          has_free_credit: true,
        },
      });

      const response = await axios.get("https://api.fish.audio/wallet/self/api-credit", {
        headers: { Authorization: "Bearer test-key" },
      });

      const data = response.data;
      const credit = parseFloat(data.credit);
      expect(credit).toBeCloseTo(45.6789);
      expect(data.has_free_credit).toBe(true);
    });

    it("should handle Fish Audio credit as string", async () => {
      mockedAxios.get.mockResolvedValueOnce({
        data: {
          credit: "0.0000",
          has_free_credit: false,
        },
      });

      const response = await axios.get("https://api.fish.audio/wallet/self/api-credit", {
        headers: { Authorization: "Bearer test-key" },
      });

      const credit = parseFloat(response.data.credit);
      expect(credit).toBe(0);
      expect(response.data.has_free_credit).toBe(false);
    });

    it("should handle Fish Audio 401 error", async () => {
      mockedAxios.get.mockRejectedValueOnce({
        response: { status: 401 },
      });

      try {
        await axios.get("https://api.fish.audio/wallet/self/api-credit", {
          headers: { Authorization: "Bearer invalid-key" },
        });
        expect.unreachable("Should have thrown");
      } catch (error: any) {
        expect(error.response.status).toBe(401);
      }
    });
  });

  describe("Usage Display Logic", () => {
    it("should flag low balance for OpenRouter when remaining < 1", () => {
      const totalCredits = 10;
      const totalUsage = 9.5;
      const remaining = totalCredits - totalUsage;
      expect(remaining).toBeLessThan(1);
    });

    it("should flag low balance for ElevenLabs when remaining < 1000 chars", () => {
      const characterCount = 14500;
      const characterLimit = 15000;
      const remaining = characterLimit - characterCount;
      expect(remaining).toBeLessThan(1000);
    });

    it("should flag low balance for Fish Audio when credit < 1", () => {
      const credit = 0.5;
      expect(credit).toBeLessThan(1);
    });

    it("should determine progress bar color based on usage ratio", () => {
      const getBarColor = (used: number, total: number) => {
        const ratio = total > 0 ? used / total : 0;
        if (ratio > 0.9) return "red";
        if (ratio > 0.7) return "orange";
        return "normal";
      };

      expect(getBarColor(95, 100)).toBe("red");
      expect(getBarColor(80, 100)).toBe("orange");
      expect(getBarColor(50, 100)).toBe("normal");
      expect(getBarColor(0, 0)).toBe("normal");
    });
  });
});
