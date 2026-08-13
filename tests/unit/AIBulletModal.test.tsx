/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";
import React from "react";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { message } from "antd";
import AIBulletModal from "@/components/profile/AIBulletModal";

const messageErrorMock = message.error as jest.Mock;

describe("AIBulletModal (REM-16)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("renders nothing meaningful when closed", () => {
    render(
      <AIBulletModal
        open={false}
        mode="generate"
        onClose={jest.fn()}
        onAccept={jest.fn()}
        onRegenerate={jest.fn()}
      />,
    );
    expect(
      screen.queryByText("Generate Bullet with AI"),
    ).not.toBeInTheDocument();
  });

  it("opens with the seeded initial text in generate mode", () => {
    render(
      <AIBulletModal
        open={true}
        mode="generate"
        initialText="Seeded draft bullet"
        onClose={jest.fn()}
        onAccept={jest.fn()}
        onRegenerate={jest.fn()}
      />,
    );

    expect(screen.getByText("Generate Bullet with AI")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Seeded draft bullet")).toBeInTheDocument();
  });

  it("shows the original text in review mode", () => {
    render(
      <AIBulletModal
        open={true}
        mode="review"
        initialText="Improved text"
        originalText="Original text"
        onClose={jest.fn()}
        onAccept={jest.fn()}
        onRegenerate={jest.fn()}
      />,
    );

    expect(screen.getByText("AI Review Suggestion")).toBeInTheDocument();
    expect(screen.getByText("Original text")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Improved text")).toBeInTheDocument();
  });

  it("closes via Discard without calling onAccept or onRegenerate", () => {
    const onClose = jest.fn();
    const onAccept = jest.fn();
    const onRegenerate = jest.fn();

    render(
      <AIBulletModal
        open={true}
        mode="generate"
        initialText="Draft"
        onClose={onClose}
        onAccept={onAccept}
        onRegenerate={onRegenerate}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /Discard/i }));

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onAccept).not.toHaveBeenCalled();
    expect(onRegenerate).not.toHaveBeenCalled();
  });

  it("submits the current comment on Regenerate and swaps in the returned text", async () => {
    const onRegenerate = jest.fn().mockResolvedValue("Regenerated bullet text");

    render(
      <AIBulletModal
        open={true}
        mode="generate"
        initialText="Draft"
        onClose={jest.fn()}
        onAccept={jest.fn()}
        onRegenerate={onRegenerate}
      />,
    );

    fireEvent.change(screen.getByPlaceholderText(/Make it more concise/i), {
      target: { value: "Make it punchier" },
    });

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Regenerate/i }));
    });

    expect(onRegenerate).toHaveBeenCalledWith("Make it punchier");
    await waitFor(() =>
      expect(
        screen.getByDisplayValue("Regenerated bullet text"),
      ).toBeInTheDocument(),
    );
  });

  it("shows a loading state while Regenerate is in flight (Regenerate/Accept buttons)", async () => {
    let resolveRegenerate: (value: string) => void = () => {};
    const onRegenerate = jest.fn(
      () =>
        new Promise<string>((resolve) => {
          resolveRegenerate = resolve;
        }),
    );

    render(
      <AIBulletModal
        open={true}
        mode="generate"
        initialText="Draft"
        onClose={jest.fn()}
        onAccept={jest.fn()}
        onRegenerate={onRegenerate}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /Regenerate/i }));

    await waitFor(() =>
      expect(screen.getByRole("button", { name: /Regenerate/i })).toHaveClass(
        "ant-btn-loading",
      ),
    );

    await act(async () => {
      resolveRegenerate("Done");
      await Promise.resolve();
    });

    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: /Regenerate/i }),
      ).not.toHaveClass("ant-btn-loading"),
    );
  });

  it("shows an error message and stays open when Regenerate rejects", async () => {
    const onRegenerate = jest
      .fn()
      .mockRejectedValue(new Error("AI regeneration failed"));

    render(
      <AIBulletModal
        open={true}
        mode="generate"
        initialText="Draft"
        onClose={jest.fn()}
        onAccept={jest.fn()}
        onRegenerate={onRegenerate}
      />,
    );

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Regenerate/i }));
    });

    await waitFor(() =>
      expect(messageErrorMock).toHaveBeenCalledWith("AI regeneration failed"),
    );
    expect(screen.getByText("Generate Bullet with AI")).toBeInTheDocument();
  });

  it("accepts the current draft, calling onAccept then onClose", async () => {
    const onAccept = jest.fn().mockResolvedValue(undefined);
    const onClose = jest.fn();

    render(
      <AIBulletModal
        open={true}
        mode="generate"
        initialText="Draft to accept"
        onClose={onClose}
        onAccept={onAccept}
        onRegenerate={jest.fn()}
      />,
    );

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Accept/i }));
    });

    expect(onAccept).toHaveBeenCalledWith("Draft to accept");
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  });

  it("shows an error message and does not close when onAccept rejects", async () => {
    const onAccept = jest
      .fn()
      .mockRejectedValue(new Error("Failed to save bullet"));
    const onClose = jest.fn();

    render(
      <AIBulletModal
        open={true}
        mode="generate"
        initialText="Draft"
        onClose={onClose}
        onAccept={onAccept}
        onRegenerate={jest.fn()}
      />,
    );

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Accept/i }));
    });

    await waitFor(() =>
      expect(messageErrorMock).toHaveBeenCalledWith("Failed to save bullet"),
    );
    expect(onClose).not.toHaveBeenCalled();
  });

  // ── US-3: keep-or-replace footer on a tagged bullet in review mode ──
  describe("keep-or-replace footer (isBulletUsed)", () => {
    it("renders Keep Original / Replace instead of Accept when reviewing a tagged bullet", () => {
      render(
        <AIBulletModal
          open={true}
          mode="review"
          initialText="Improved text"
          originalText="Original text"
          isBulletUsed={true}
          onClose={jest.fn()}
          onAccept={jest.fn()}
          onRegenerate={jest.fn()}
        />,
      );

      expect(
        screen.getByRole("button", { name: /Keep Original/i }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: /Replace/i }),
      ).toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: /Accept/i }),
      ).not.toBeInTheDocument();
    });

    it("invokes onAccept(text, true) when Keep Original is clicked, with no write until then", async () => {
      const onAccept = jest.fn().mockResolvedValue(undefined);
      const onClose = jest.fn();

      render(
        <AIBulletModal
          open={true}
          mode="review"
          initialText="Improved text"
          originalText="Original text"
          isBulletUsed={true}
          onClose={onClose}
          onAccept={onAccept}
          onRegenerate={jest.fn()}
        />,
      );

      expect(onAccept).not.toHaveBeenCalled();

      await act(async () => {
        fireEvent.click(screen.getByRole("button", { name: /Keep Original/i }));
      });

      expect(onAccept).toHaveBeenCalledWith("Improved text", true);
      await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    });

    it("invokes onAccept(text, false) when Replace is clicked", async () => {
      const onAccept = jest.fn().mockResolvedValue(undefined);
      const onClose = jest.fn();

      render(
        <AIBulletModal
          open={true}
          mode="review"
          initialText="Improved text"
          originalText="Original text"
          isBulletUsed={true}
          onClose={onClose}
          onAccept={onAccept}
          onRegenerate={jest.fn()}
        />,
      );

      await act(async () => {
        fireEvent.click(screen.getByRole("button", { name: /Replace/i }));
      });

      expect(onAccept).toHaveBeenCalledWith("Improved text", false);
      await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    });

    it("renders the single Accept button unchanged when isBulletUsed is false (regression)", () => {
      render(
        <AIBulletModal
          open={true}
          mode="review"
          initialText="Improved text"
          originalText="Original text"
          isBulletUsed={false}
          onClose={jest.fn()}
          onAccept={jest.fn()}
          onRegenerate={jest.fn()}
        />,
      );

      expect(
        screen.getByRole("button", { name: /Accept/i }),
      ).toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: /Keep Original/i }),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: /Replace/i }),
      ).not.toBeInTheDocument();
    });

    it("renders the single Accept button unchanged in generate mode even if isBulletUsed is true (regression)", () => {
      render(
        <AIBulletModal
          open={true}
          mode="generate"
          initialText="Draft"
          isBulletUsed={true}
          onClose={jest.fn()}
          onAccept={jest.fn()}
          onRegenerate={jest.fn()}
        />,
      );

      expect(
        screen.getByRole("button", { name: /Accept/i }),
      ).toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: /Keep Original/i }),
      ).not.toBeInTheDocument();
    });
  });
});
