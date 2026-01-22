import { describe, it, expect } from "vitest";
import { buyFormSchema } from "../buy-form";
import { sellFormSchema } from "../sell-form";
import { depositFormSchema } from "../deposit-form";
import { withdrawalFormSchema } from "../withdrawal-form";
import { dividendFormSchema } from "../dividend-form";
import { transferFormSchema } from "../transfer-form";
import { splitFormSchema } from "../split-form";
import { feeFormSchema } from "../fee-form";
import { interestFormSchema } from "../interest-form";
import { taxFormSchema } from "../tax-form";

describe("Form Schemas Validation", () => {
  describe("buyFormSchema", () => {
    it("validates a complete valid buy form", () => {
      const validData = {
        accountId: "acc-123",
        assetId: "AAPL",
        activityDate: new Date(),
        quantity: 10,
        unitPrice: 150.5,
        amount: 1505,
        fee: 5,
        comment: "Test purchase",
      };

      const result = buyFormSchema.safeParse(validData);
      expect(result.success).toBe(true);
    });

    it("fails when accountId is empty", () => {
      const invalidData = {
        accountId: "",
        assetId: "AAPL",
        activityDate: new Date(),
        quantity: 10,
        unitPrice: 150.5,
      };

      const result = buyFormSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toBe("Please select an account.");
      }
    });

    it("fails when assetId is empty", () => {
      const invalidData = {
        accountId: "acc-123",
        assetId: "",
        activityDate: new Date(),
        quantity: 10,
        unitPrice: 150.5,
      };

      const result = buyFormSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toBe("Please enter a symbol.");
      }
    });

    it("fails when quantity is zero or negative", () => {
      const zeroQuantity = {
        accountId: "acc-123",
        assetId: "AAPL",
        activityDate: new Date(),
        quantity: 0,
        unitPrice: 150.5,
      };

      const result = buyFormSchema.safeParse(zeroQuantity);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toBe("Quantity must be greater than 0.");
      }

      const negativeQuantity = {
        ...zeroQuantity,
        quantity: -5,
      };

      const negativeResult = buyFormSchema.safeParse(negativeQuantity);
      expect(negativeResult.success).toBe(false);
    });

    it("fails when unitPrice is zero or negative", () => {
      const zeroPrice = {
        accountId: "acc-123",
        assetId: "AAPL",
        activityDate: new Date(),
        quantity: 10,
        unitPrice: 0,
      };

      const result = buyFormSchema.safeParse(zeroPrice);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toBe("Price must be greater than 0.");
      }
    });

    it("fails when fee is negative", () => {
      const negativeFee = {
        accountId: "acc-123",
        assetId: "AAPL",
        activityDate: new Date(),
        quantity: 10,
        unitPrice: 150.5,
        fee: -5,
      };

      const result = buyFormSchema.safeParse(negativeFee);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toBe("Fee must be non-negative.");
      }
    });

    it("coerces string numbers to numbers", () => {
      const stringNumbers = {
        accountId: "acc-123",
        assetId: "AAPL",
        activityDate: new Date(),
        quantity: "10" as unknown as number,
        unitPrice: "150.5" as unknown as number,
        fee: "5" as unknown as number,
      };

      const result = buyFormSchema.safeParse(stringNumbers);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(typeof result.data.quantity).toBe("number");
        expect(typeof result.data.unitPrice).toBe("number");
        expect(typeof result.data.fee).toBe("number");
      }
    });
  });

  describe("sellFormSchema", () => {
    it("validates a complete valid sell form", () => {
      const validData = {
        accountId: "acc-123",
        assetId: "AAPL",
        activityDate: new Date(),
        quantity: 10,
        unitPrice: 150.5,
        amount: 1500,
        fee: 5,
        comment: "Test sale",
      };

      const result = sellFormSchema.safeParse(validData);
      expect(result.success).toBe(true);
    });

    it("fails when required fields are missing", () => {
      const missingFields = {
        accountId: "",
        assetId: "",
      };

      const result = sellFormSchema.safeParse(missingFields);
      expect(result.success).toBe(false);
    });

    it("fails when quantity is not positive", () => {
      const invalidQuantity = {
        accountId: "acc-123",
        assetId: "AAPL",
        activityDate: new Date(),
        quantity: 0,
        unitPrice: 150.5,
      };

      const result = sellFormSchema.safeParse(invalidQuantity);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toBe("Quantity must be greater than 0.");
      }
    });
  });

  describe("depositFormSchema", () => {
    it("validates a complete valid deposit form", () => {
      const validData = {
        accountId: "acc-123",
        activityDate: new Date(),
        amount: 1000,
        comment: "Monthly deposit",
      };

      const result = depositFormSchema.safeParse(validData);
      expect(result.success).toBe(true);
    });

    it("fails when accountId is empty", () => {
      const invalidData = {
        accountId: "",
        activityDate: new Date(),
        amount: 1000,
      };

      const result = depositFormSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toBe("Please select an account.");
      }
    });

    it("fails when amount is zero or negative", () => {
      const zeroAmount = {
        accountId: "acc-123",
        activityDate: new Date(),
        amount: 0,
      };

      const result = depositFormSchema.safeParse(zeroAmount);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toBe("Amount must be greater than 0.");
      }
    });

    it("allows optional comment to be null", () => {
      const withNullComment = {
        accountId: "acc-123",
        activityDate: new Date(),
        amount: 1000,
        comment: null,
      };

      const result = depositFormSchema.safeParse(withNullComment);
      expect(result.success).toBe(true);
    });
  });

  describe("withdrawalFormSchema", () => {
    it("validates a complete valid withdrawal form", () => {
      const validData = {
        accountId: "acc-123",
        activityDate: new Date(),
        amount: 500,
        comment: "Emergency withdrawal",
      };

      const result = withdrawalFormSchema.safeParse(validData);
      expect(result.success).toBe(true);
    });

    it("fails when amount is not positive", () => {
      const invalidAmount = {
        accountId: "acc-123",
        activityDate: new Date(),
        amount: -100,
      };

      const result = withdrawalFormSchema.safeParse(invalidAmount);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toBe("Amount must be greater than 0.");
      }
    });
  });

  describe("dividendFormSchema", () => {
    it("validates a complete valid dividend form", () => {
      const validData = {
        accountId: "acc-123",
        symbol: "AAPL",
        activityDate: new Date(),
        amount: 25.5,
        comment: "Q1 dividend",
      };

      const result = dividendFormSchema.safeParse(validData);
      expect(result.success).toBe(true);
    });

    it("fails when symbol is empty", () => {
      const invalidData = {
        accountId: "acc-123",
        symbol: "",
        activityDate: new Date(),
        amount: 25.5,
      };

      const result = dividendFormSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toBe("Please enter a symbol.");
      }
    });

    it("fails when amount is not positive", () => {
      const invalidAmount = {
        accountId: "acc-123",
        symbol: "AAPL",
        activityDate: new Date(),
        amount: 0,
      };

      const result = dividendFormSchema.safeParse(invalidAmount);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toBe("Amount must be greater than 0.");
      }
    });
  });

  describe("transferFormSchema", () => {
    describe("internal cash transfers", () => {
      it("validates a complete valid internal cash transfer", () => {
        const validData = {
          isExternal: false,
          direction: "in",
          fromAccountId: "acc-123",
          toAccountId: "acc-456",
          activityDate: new Date(),
          transferMode: "cash",
          amount: 1000,
          comment: "Transfer to savings",
        };

        const result = transferFormSchema.safeParse(validData);
        expect(result.success).toBe(true);
      });

      it("fails when fromAccountId is empty for internal transfer", () => {
        const invalidData = {
          isExternal: false,
          fromAccountId: "",
          toAccountId: "acc-456",
          activityDate: new Date(),
          transferMode: "cash",
          amount: 1000,
        };

        const result = transferFormSchema.safeParse(invalidData);
        expect(result.success).toBe(false);
        if (!result.success) {
          const error = result.error.issues.find((issue) =>
            issue.message.includes("source account"),
          );
          expect(error).toBeDefined();
        }
      });

      it("fails when toAccountId is empty for internal transfer", () => {
        const invalidData = {
          isExternal: false,
          fromAccountId: "acc-123",
          toAccountId: "",
          activityDate: new Date(),
          transferMode: "cash",
          amount: 1000,
        };

        const result = transferFormSchema.safeParse(invalidData);
        expect(result.success).toBe(false);
        if (!result.success) {
          const error = result.error.issues.find((issue) =>
            issue.message.includes("destination account"),
          );
          expect(error).toBeDefined();
        }
      });

      it("fails when source and destination accounts are the same", () => {
        const sameAccount = {
          isExternal: false,
          fromAccountId: "acc-123",
          toAccountId: "acc-123",
          activityDate: new Date(),
          transferMode: "cash",
          amount: 1000,
        };

        const result = transferFormSchema.safeParse(sameAccount);
        expect(result.success).toBe(false);
        if (!result.success) {
          const refinementError = result.error.issues.find(
            (issue) => issue.path.includes("toAccountId") && issue.message.includes("different"),
          );
          expect(refinementError).toBeDefined();
        }
      });

      it("fails when amount is not positive in cash mode", () => {
        const invalidAmount = {
          isExternal: false,
          fromAccountId: "acc-123",
          toAccountId: "acc-456",
          activityDate: new Date(),
          transferMode: "cash",
          amount: 0,
        };

        const result = transferFormSchema.safeParse(invalidAmount);
        expect(result.success).toBe(false);
        if (!result.success) {
          const error = result.error.issues.find((issue) =>
            issue.message.includes("enter an amount"),
          );
          expect(error).toBeDefined();
        }
      });
    });

    describe("internal securities transfers", () => {
      it("validates a complete valid internal securities transfer", () => {
        const validData = {
          isExternal: false,
          fromAccountId: "acc-123",
          toAccountId: "acc-456",
          activityDate: new Date(),
          transferMode: "securities",
          assetId: "AAPL",
          quantity: 10,
          comment: "Security transfer",
        };

        const result = transferFormSchema.safeParse(validData);
        expect(result.success).toBe(true);
      });

      it("fails when assetId is missing in securities mode", () => {
        const invalidData = {
          isExternal: false,
          fromAccountId: "acc-123",
          toAccountId: "acc-456",
          activityDate: new Date(),
          transferMode: "securities",
          quantity: 10,
        };

        const result = transferFormSchema.safeParse(invalidData);
        expect(result.success).toBe(false);
        if (!result.success) {
          const error = result.error.issues.find((issue) =>
            issue.message.includes("select a symbol"),
          );
          expect(error).toBeDefined();
        }
      });

      it("fails when quantity is missing in securities mode", () => {
        const invalidData = {
          isExternal: false,
          fromAccountId: "acc-123",
          toAccountId: "acc-456",
          activityDate: new Date(),
          transferMode: "securities",
          assetId: "AAPL",
        };

        const result = transferFormSchema.safeParse(invalidData);
        expect(result.success).toBe(false);
        if (!result.success) {
          const error = result.error.issues.find((issue) =>
            issue.message.includes("enter a quantity"),
          );
          expect(error).toBeDefined();
        }
      });

      it("fails when quantity is zero or negative in securities mode", () => {
        const invalidQuantity = {
          isExternal: false,
          fromAccountId: "acc-123",
          toAccountId: "acc-456",
          activityDate: new Date(),
          transferMode: "securities",
          assetId: "AAPL",
          quantity: 0,
        };

        const result = transferFormSchema.safeParse(invalidQuantity);
        expect(result.success).toBe(false);
        if (!result.success) {
          const quantityError = result.error.issues.find((issue) =>
            issue.message.includes("enter a quantity"),
          );
          expect(quantityError).toBeDefined();
        }
      });
    });

    describe("external transfers", () => {
      it("validates a complete valid external transfer in (cash)", () => {
        const validData = {
          isExternal: true,
          direction: "in",
          accountId: "acc-123",
          activityDate: new Date(),
          transferMode: "cash",
          amount: 2000,
          comment: "External transfer in",
        };

        const result = transferFormSchema.safeParse(validData);
        expect(result.success).toBe(true);
      });

      it("validates a complete valid external transfer out (cash)", () => {
        const validData = {
          isExternal: true,
          direction: "out",
          accountId: "acc-123",
          activityDate: new Date(),
          transferMode: "cash",
          amount: 500,
          comment: "External transfer out",
        };

        const result = transferFormSchema.safeParse(validData);
        expect(result.success).toBe(true);
      });

      it("fails when accountId is empty for external transfer", () => {
        const invalidData = {
          isExternal: true,
          direction: "in",
          accountId: "",
          activityDate: new Date(),
          transferMode: "cash",
          amount: 1000,
        };

        const result = transferFormSchema.safeParse(invalidData);
        expect(result.success).toBe(false);
        if (!result.success) {
          const error = result.error.issues.find((issue) =>
            issue.message.includes("select an account"),
          );
          expect(error).toBeDefined();
        }
      });

      it("validates external securities transfer", () => {
        const validData = {
          isExternal: true,
          direction: "in",
          accountId: "acc-123",
          activityDate: new Date(),
          transferMode: "securities",
          assetId: "AAPL",
          quantity: 5,
          comment: "External securities transfer in",
        };

        const result = transferFormSchema.safeParse(validData);
        expect(result.success).toBe(true);
      });
    });
  });

  describe("splitFormSchema", () => {
    it("validates a complete valid split form", () => {
      const validData = {
        accountId: "acc-123",
        symbol: "AAPL",
        activityDate: new Date(),
        splitRatio: 2,
        comment: "2:1 stock split",
      };

      const result = splitFormSchema.safeParse(validData);
      expect(result.success).toBe(true);
    });

    it("fails when symbol is empty", () => {
      const invalidData = {
        accountId: "acc-123",
        symbol: "",
        activityDate: new Date(),
        splitRatio: 2,
      };

      const result = splitFormSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toBe("Please enter a symbol.");
      }
    });

    it("fails when splitRatio is zero or negative", () => {
      const zeroRatio = {
        accountId: "acc-123",
        symbol: "AAPL",
        activityDate: new Date(),
        splitRatio: 0,
      };

      const result = splitFormSchema.safeParse(zeroRatio);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toBe("Split ratio must be greater than 0.");
      }
    });

    it("accepts decimal split ratios", () => {
      const decimalRatio = {
        accountId: "acc-123",
        symbol: "AAPL",
        activityDate: new Date(),
        splitRatio: 0.5, // Reverse split
      };

      const result = splitFormSchema.safeParse(decimalRatio);
      expect(result.success).toBe(true);
    });
  });

  describe("feeFormSchema", () => {
    it("validates a complete valid fee form", () => {
      const validData = {
        accountId: "acc-123",
        activityDate: new Date(),
        amount: 25,
        comment: "Account maintenance fee",
      };

      const result = feeFormSchema.safeParse(validData);
      expect(result.success).toBe(true);
    });

    it("fails when amount is not positive", () => {
      const invalidAmount = {
        accountId: "acc-123",
        activityDate: new Date(),
        amount: 0,
      };

      const result = feeFormSchema.safeParse(invalidAmount);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toBe("Amount must be greater than 0.");
      }
    });
  });

  describe("interestFormSchema", () => {
    it("validates a complete valid interest form", () => {
      const validData = {
        accountId: "acc-123",
        activityDate: new Date(),
        amount: 15.5,
        comment: "Monthly interest",
      };

      const result = interestFormSchema.safeParse(validData);
      expect(result.success).toBe(true);
    });

    it("fails when amount is not positive", () => {
      const invalidAmount = {
        accountId: "acc-123",
        activityDate: new Date(),
        amount: -5,
      };

      const result = interestFormSchema.safeParse(invalidAmount);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toBe("Amount must be greater than 0.");
      }
    });
  });

  describe("taxFormSchema", () => {
    it("validates a complete valid tax form", () => {
      const validData = {
        accountId: "acc-123",
        activityDate: new Date(),
        amount: 100,
        comment: "Withholding tax",
      };

      const result = taxFormSchema.safeParse(validData);
      expect(result.success).toBe(true);
    });

    it("fails when amount is not positive", () => {
      const invalidAmount = {
        accountId: "acc-123",
        activityDate: new Date(),
        amount: 0,
      };

      const result = taxFormSchema.safeParse(invalidAmount);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toBe("Amount must be greater than 0.");
      }
    });

    it("fails when accountId is missing", () => {
      const missingAccount = {
        accountId: "",
        activityDate: new Date(),
        amount: 100,
      };

      const result = taxFormSchema.safeParse(missingAccount);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toBe("Please select an account.");
      }
    });
  });
});
