/**
 * @NApiVersion 2.x
 * @NScriptType Restlet
 * @NModuleScope Public
 */
define(["N/record", "N/log", "N/search", "N/file"], function (
  recordModule,
  logModule,
  search,
  file
) {
  function postProcess(request) {
    if (typeof request.function == "undefined" || request.function == "") {
      return {
        error: "No function was specified.",
      };
    }
    switch (request.function) {
      case "generateVendorBill":
        return generateVendorBill(request);
      case "fileCreate":
        return fileCreate(request);
      default:
        return {
          error: "Unsupported Function",
        };
    }
  }

  function generateVendorBill(request) {
    if (!request.purchaseOrderId) {
      return {
        error: "No purchaseOrderId was specified.",
      };
    }

    try {
      var purchaseOrderId = request.purchaseOrderId;

      var purchaseOrder = recordModule.load({
        type: recordModule.Type.PURCHASE_ORDER,
        id: purchaseOrderId,
        isDynamic: true,
      });

      // Start validation if need
      var orderStatus = purchaseOrder.getValue({
        fieldId: "statusRef",
      });

      log.debug("PO Order status", orderStatus);

      if (
        request.purchaseOrderStatus &&
        request.purchaseOrderStatus.length > 0
      ) {
        var matchedStatusValue = false;
        for (var i = 0; i < request.purchaseOrderStatus.length; i++) {
          if (request.purchaseOrderStatus[i] === orderStatus) {
            matchedStatusValue = true;
            break;
          }
        }

        if (!matchedStatusValue) {
          return {
            error:
              "Purchase Order Status validation failed: The status does not match any of the allowed values.",
          };
        }
      }

      var approvalWorkflowProgress = purchaseOrder.getValue({
        fieldId: "custbody_approval_worflow_progress",
      });

      if (
        request.purchaseOrderWorkflowProgress &&
        approvalWorkflowProgress !== request.purchaseOrderWorkflowProgress
      ) {
        return {
          error:
            "Approval Workflow Progress validation failed: The progress status does not match.",
        };
      }

      log.debug("All validation are passed");

      var vendorBill = recordModule.transform({
        fromType: recordModule.Type.PURCHASE_ORDER,
        fromId: purchaseOrderId,
        toType: recordModule.Type.VENDOR_BILL,
        isDynamic: true,
      });

      if (
        request.additionalLines.additionalItems &&
        request.additionalLines.additionalItems.length > 0
      ) {
        var additionalItems = request.additionalLines.additionalItems;
        for (var k = 0; k < additionalItems.length; k++) {
          var additionalItem = additionalItems[k];

          vendorBill.selectNewLine({
            sublistId: "item",
          });

          vendorBill.setCurrentSublistValue({
            sublistId: "item",
            fieldId: "item",
            value: additionalItem.item,
          });

          vendorBill.setCurrentSublistValue({
            sublistId: "item",
            fieldId: "location",
            value: additionalItem.location,
          });

          vendorBill.setCurrentSublistValue({
            sublistId: "item",
            fieldId: "class",
            value: additionalItem.classification,
          });

          vendorBill.setCurrentSublistValue({
            sublistId: "item",
            fieldId: "department",
            value: additionalItem.department,
          });

          vendorBill.setCurrentSublistValue({
            sublistId: "item",
            fieldId: "quantity",
            value: additionalItem.quantity,
          });

          vendorBill.setCurrentSublistValue({
            sublistId: "item",
            fieldId: "amount",
            value: additionalItem.amount,
          });

          vendorBill.setCurrentSublistValue({
            sublistId: "item",
            fieldId: "description",
            value: additionalItem.description,
          });

          vendorBill.commitLine({
            sublistId: "item",
          });
        }
      }

      if (
        request.additionalLines.additionalExpenses &&
        request.additionalLines.additionalExpenses.length > 0
      ) {
        var additionalExpenses = request.additionalLines.additionalExpenses;
        for (var l = 0; l < additionalExpenses.length; l++) {
          const additionalExpense = additionalExpenses[l];

          vendorBill.selectNewLine({
            sublistId: "expense",
          });

          vendorBill.setCurrentSublistValue({
            sublistId: "expense",
            fieldId: "account",
            value: additionalExpense.expense,
          });

          vendorBill.setCurrentSublistValue({
            sublistId: "expense",
            fieldId: "location",
            value: additionalExpense.location,
          });

          vendorBill.setCurrentSublistValue({
            sublistId: "expense",
            fieldId: "class",
            value: additionalExpense.classification,
          });

          vendorBill.setCurrentSublistValue({
            sublistId: "expense",
            fieldId: "department",
            value: additionalExpense.department,
          });

          vendorBill.setCurrentSublistValue({
            sublistId: "expense",
            fieldId: "amount",
            value: additionalExpense.amount,
          });

          vendorBill.setCurrentSublistValue({
            sublistId: "expense",
            fieldId: "memo",
            value: additionalExpense.description,
          });

          vendorBill.commitLine({
            sublistId: "expense",
          });
        }
      }

      var expenseCount = vendorBill.getLineCount({
        sublistId: "expense",
      });
      log.debug("Expense line count", expenseCount);

      var rows = request.lineItems && request.lineItems.rows;

      if (!Array.isArray(rows) || rows.length === 0) {
        log.debug("No Line Items in request", rows);
        return;
      }

      // --- EXPENSE LINE MATCHING & CLEANUP ---

      function normalizeMatchValue(value) {
        if (value === null || value === undefined) {
          return "";
        }
        var normalized = String(value).trim().toLowerCase();
        return normalized.replace(/\s+/g, " ");
      }

      var expenseLineArray = [];
      var expenseCount = vendorBill.getLineCount({ sublistId: "expense" });
      var rows =
        request.lineItems && request.lineItems.rows
          ? request.lineItems.rows
          : [];

      if (expenseCount > 0 && rows.length > 0) {
        for (
          var expenseLine = expenseCount - 1;
          expenseLine >= 0;
          expenseLine--
        ) {
          vendorBill.selectLine({
            sublistId: "expense",
            line: expenseLine,
          });

          var expenseAmount = vendorBill.getCurrentSublistValue({
            sublistId: "expense",
            fieldId: "amount",
          });

          if (!expenseAmount && expenseAmount !== 0) {
            log.debug("Removing empty expense line", "Line " + expenseLine);
            vendorBill.removeLine({
              sublistId: "expense",
              line: expenseLine,
              ignoreRecalc: true,
            });
            continue;
          }

          var expenseNormalized = Number(Number(expenseAmount).toFixed(2));
          var foundMatch = false;
          var memoValue = "";

          for (var v = 0; v < rows.length; v++) {
            var row = rows[v];
            var rowValue = null;

            if (row.total && row.total.value) {
              rowValue = Number(row.total.value);
            } else if (row.amount && row.amount.value) {
              rowValue = Number(row.amount.value);
            }

            if (rowValue == null) continue;

            var rowNormalized = Number(rowValue.toFixed(2));

            if (expenseNormalized === rowNormalized) {
              foundMatch = true;
              if (row.description && row.description.value) {
                memoValue = row.description.value;
                vendorBill.setCurrentSublistValue({
                  sublistId: "expense",
                  fieldId: "memo",
                  value: memoValue,
                });
              }

              vendorBill.commitLine({ sublistId: "expense" });

              expenseLineArray.push({
                line: expenseLine,
                expenseAmount: expenseNormalized,
                rowIndex: v,
                memoValue: memoValue,
              });

              log.debug("Matched expense line", {
                line: expenseLine,
                expenseAmount: expenseNormalized,
                rowIndex: v,
                memoValue: memoValue,
              });
              break;
            }
          }

          if (!foundMatch) {
            log.debug("No match for expense line — removing", {
              line: expenseLine,
              expenseAmount: expenseNormalized,
            });

            vendorBill.removeLine({
              sublistId: "expense",
              line: expenseLine,
              ignoreRecalc: true,
            });
          }
        }
      }

      // Check for items
      var matchedLines = {};
      // Track row status to delay validation until both matching passes finish
      var rowMatchStatus = {};
      var unmatchedRows = [];
      var unmatchedRowsByDescription = {};
      var unmatchedRowsByProductCode = {};
      // Track product code usage per item line so duplicates can be skipped for custom handling later
      var itemLineCount = vendorBill.getLineCount({
        sublistId: "item",
      });
      var productCodeUsage = {};
      var itemLineProductCodes = {};
      var skippedDuplicateLines = [];

      for (
        var itemLineIndex = 0;
        itemLineIndex < itemLineCount;
        itemLineIndex++
      ) {
        var perLineCodes = [];
        var seenCodes = {};

        var lineProductCode = vendorBill.getSublistValue({
          sublistId: "item",
          fieldId: "vendorname",
          line: itemLineIndex,
        });

        var lineAvaItem = vendorBill.getSublistValue({
          sublistId: "item",
          fieldId: "custcol_ava_item",
          line: itemLineIndex,
        });

        var lineItemCode = vendorBill.getSublistValue({
          sublistId: "item",
          fieldId: "custcol_itemcode",
          line: itemLineIndex,
        });

        var codeCandidates = [lineProductCode, lineAvaItem, lineItemCode];
        for (var codeIdx = 0; codeIdx < codeCandidates.length; codeIdx++) {
          var codeCandidate = codeCandidates[codeIdx];
          if (codeCandidate === null || codeCandidate === undefined) {
            continue;
          }

          var normalizedCandidate = String(codeCandidate).trim();
          if (!normalizedCandidate) {
            continue;
          }

          normalizedCandidate = normalizedCandidate.toLowerCase();
          if (seenCodes[normalizedCandidate]) {
            continue;
          }

          seenCodes[normalizedCandidate] = true;
          perLineCodes.push(normalizedCandidate);
          productCodeUsage[normalizedCandidate] =
            (productCodeUsage[normalizedCandidate] || 0) + 1;
        }

        if (perLineCodes.length) {
          itemLineProductCodes[itemLineIndex] = perLineCodes;
        }
      }

      for (
        var rowIndex = 0;
        rowIndex < request.lineItems.rows.length;
        rowIndex++
      ) {
        var row = request.lineItems.rows[rowIndex];
        rowMatchStatus[rowIndex] = false;
        if (
          (!row.productCode || !row.productCode.value) &&
          (!row.description || !row.description.value)
        ) {
          log.error({
            title: "Product Code and Description are Missing",
            details:
              "No product code and description for line item at index " +
              rowIndex,
          });
          return {
            error:
              "Product code  and description are missing for line item at index " +
              (rowIndex + 1) +
              ".",
          };
        }

        var productCode = "";
        if (row && row.productCode && row.productCode.value) {
          productCode = String(row.productCode.value).trim();
        } else if (row && row.code && row.code.value) {
          productCode = String(row.code.value).trim();
        }
        var description =
          row && row.description && row.description.value
            ? String(row.description.value).trim()
            : "";
        var descriptionNormalized = normalizeMatchValue(description);
        var productCodeNormalized = normalizeMatchValue(productCode);
        var qty = row && row.qty && row.qty.value ? row.qty.value : null;
        var lineCount = vendorBill.getLineCount({
          sublistId: "item",
        });

        if (lineCount === 0 && expenseCount === 0) {
          log.error({
            title: "No Items / Expenses Found",
            details:
              "No items / expenses found in the Vendor Bill to match with request line items.",
          });
          return {
            error: "No items / expenses found in the Vendor Bill.",
          };
        }

        var matchFound = false;
        for (var i = 0; i < lineCount; i++) {
          var itemProductCode = vendorBill.getSublistValue({
            sublistId: "item",
            fieldId: "vendorname",
            line: i,
          });

          var itemDescription = vendorBill.getSublistValue({
            sublistId: "item",
            fieldId: "description",
            line: i,
          });

          var itemAvaItem = vendorBill.getSublistValue({
            sublistId: "item",
            fieldId: "custcol_ava_item",
            line: i,
          });

          var itemItemCode = vendorBill.getSublistValue({
            sublistId: "item",
            fieldId: "custcol_itemcode",
            line: i,
          });

          var itemSalesDescription = vendorBill.getSublistValue({
            sublistId: "item",
            fieldId: "custcol_sk_sales_description",
            line: i,
          });

          log.debug({
            title: "itemSalesDescription Value",
            details: "Line " + i + ": " + itemSalesDescription,
          });

          log.debug({
            title: "itemItemCode Value",
            details: "Line " + i + ": " + itemItemCode,
          });

          log.debug({
            title: "itemAvaItem Value",
            details: "Line " + i + ": " + itemAvaItem,
          });

          log.debug({
            title: "itemProductCode Value",
            details: "Line " + i + ": " + itemProductCode,
          });

          log.debug({
            title: "itemDescription Value",
            details: "Line " + i + ": " + itemDescription,
          });

          var normalizedItemProductCode = normalizeMatchValue(itemProductCode);
          var normalizedItemAvaItem = normalizeMatchValue(itemAvaItem);
          var normalizedItemItemCode = normalizeMatchValue(itemItemCode);
          var normalizedItemDescription = normalizeMatchValue(itemDescription);
          var normalizedItemSalesDescription = normalizeMatchValue(
            itemSalesDescription
          );

          var duplicateCodesForLine = itemLineProductCodes[i] || [];
          var skipDueToDuplicateProductCode = false;

          for (
            var duplicateIdx = 0;
            duplicateIdx < duplicateCodesForLine.length;
            duplicateIdx++
          ) {
            var duplicateCodeKey = duplicateCodesForLine[duplicateIdx];
            if (productCodeUsage[duplicateCodeKey] > 1) {
              skipDueToDuplicateProductCode = true;
              break;
            }
          }

          if (skipDueToDuplicateProductCode) {
            // Skip lines with repeated product codes; custom logic will process them separately
            log.debug({
              title: "Skipping item line with non-unique product code",
              details: "Line " + (i + 1),
            });
            if (skippedDuplicateLines.indexOf(i) === -1) {
              skippedDuplicateLines.push(i);
            }
            continue;
          }

          var isMatch =
            (productCodeNormalized &&
              normalizedItemProductCode &&
              normalizedItemProductCode === productCodeNormalized) ||
            (descriptionNormalized &&
              normalizedItemDescription &&
              normalizedItemDescription === descriptionNormalized) ||
            (productCodeNormalized &&
              normalizedItemAvaItem &&
              productCodeNormalized === normalizedItemAvaItem) ||
            (productCodeNormalized &&
              normalizedItemItemCode &&
              productCodeNormalized === normalizedItemItemCode) ||
            (descriptionNormalized &&
              normalizedItemSalesDescription &&
              normalizedItemSalesDescription === descriptionNormalized);

          if (isMatch) {
            matchFound = true;
            matchedLines[i] = true;
            rowMatchStatus[rowIndex] = true;

            try {
              vendorBill.selectLine({
                sublistId: "item",
                line: i,
              });

              vendorBill.setCurrentSublistValue({
                sublistId: "item",
                fieldId: "quantity",
                value: qty,
              });

              vendorBill.commitLine({
                sublistId: "item",
              });

              log.debug({
                title: "Quantity Set Successfully",
                details:
                  "Product Code: " +
                  productCode +
                  ", Quantity: " +
                  qty +
                  " (Line " +
                  (i + 1) +
                  ")",
              });
            } catch (e) {
              log.error({
                title: "Error Setting Quantity for Product Code " + productCode,
                details: e,
              });
              return {
                error:
                  "Error setting quantity for product code " +
                  productCode +
                  ".",
              };
            }
            break;
          }
        }

        if (!matchFound) {
          var shouldRaiseError = !row.skip && !expenseLineArray.length;
          var unmatchedEntry = {
            rowIndex: rowIndex,
            descriptionLower: descriptionNormalized,
            rawDescription: description,
            productCodeLower: productCodeNormalized,
            rawProductCode: productCode,
            qty: qty,
            shouldError: shouldRaiseError,
            matched: false,
          };
          unmatchedRows.push(unmatchedEntry);

          if (unmatchedEntry.descriptionLower) {
            if (!unmatchedRowsByDescription[unmatchedEntry.descriptionLower]) {
              unmatchedRowsByDescription[unmatchedEntry.descriptionLower] = [];
            }
            unmatchedRowsByDescription[unmatchedEntry.descriptionLower].push(
              unmatchedEntry
            );
          }
          if (unmatchedEntry.productCodeLower) {
            if (!unmatchedRowsByProductCode[unmatchedEntry.productCodeLower]) {
              unmatchedRowsByProductCode[unmatchedEntry.productCodeLower] = [];
            }
            unmatchedRowsByProductCode[unmatchedEntry.productCodeLower].push(
              unmatchedEntry
            );
          }
        } else {
          rowMatchStatus[rowIndex] = true;
        }
      }

      if (
        skippedDuplicateLines.length > 0 &&
        request.originalItems &&
        Array.isArray(request.originalItems.rows) &&
        request.originalItems.rows.length > 0
      ) {
        // Second pass: reuse originalItems to try matching duplicate lines by descriptions
        var originalRows = request.originalItems.rows;
        var duplicateMatchedLines = {};

        for (
          var originalRowIndex = 0;
          originalRowIndex < originalRows.length;
          originalRowIndex++
        ) {
          var originalRow = originalRows[originalRowIndex];
          if (!originalRow) {
            continue;
          }

          var originalDescription =
            originalRow.description &&
            originalRow.description.value &&
            String(originalRow.description.value).trim()
              ? String(originalRow.description.value).trim()
              : "";

          var originalDescriptionLower = normalizeMatchValue(
            originalDescription
          );

          if (!originalDescriptionLower) {
            continue;
          }

          var originalProductCode = "";
          if (
            originalRow &&
            originalRow.productCode &&
            originalRow.productCode.value
          ) {
            originalProductCode = String(
              originalRow.productCode.value
            ).trim();
          } else if (originalRow && originalRow.code && originalRow.code.value) {
            originalProductCode = String(originalRow.code.value).trim();
          }
          var originalProductCodeLower = normalizeMatchValue(
            originalProductCode
          );

          var originalQty =
            originalRow.qty && originalRow.qty.value
              ? originalRow.qty.value
              : null;

          for (
            var skippedIdx = 0;
            skippedIdx < skippedDuplicateLines.length;
            skippedIdx++
          ) {
            var skippedLineIndex = skippedDuplicateLines[skippedIdx];
            if (duplicateMatchedLines[skippedLineIndex]) {
              continue;
            }

            var skippedItemDescription = vendorBill.getSublistValue({
              sublistId: "item",
              fieldId: "description",
              line: skippedLineIndex,
            });

            var skippedItemSalesDescription = vendorBill.getSublistValue({
              sublistId: "item",
              fieldId: "custcol_sk_sales_description",
              line: skippedLineIndex,
            });

            // Allow partial description matches in both directions to cover similar wording
            var itemDescriptionLower = normalizeMatchValue(
              skippedItemDescription
            );
            var itemSalesDescriptionLower = normalizeMatchValue(
              skippedItemSalesDescription
            );
            var descriptionMatch = false;

            log.debug({
              title: "itemDescriptionLower",
              details: itemDescriptionLower,
            });

            log.debug({
              title: "originalDescriptionLower",
              details: originalDescriptionLower,
            });
            if (itemDescriptionLower) {
              descriptionMatch =
                itemDescriptionLower.indexOf(originalDescriptionLower) !== -1 ||
                originalDescriptionLower.indexOf(itemDescriptionLower) !== -1;
            }
            if (!descriptionMatch && itemSalesDescriptionLower) {
              descriptionMatch =
                itemSalesDescriptionLower.indexOf(originalDescriptionLower) !==
                  -1 ||
                originalDescriptionLower.indexOf(itemSalesDescriptionLower) !==
                  -1;
            }
            if (!descriptionMatch) {
              continue;
            }

            ////
            var unmatchedCandidates =
              unmatchedRowsByDescription[originalDescriptionLower];
            if (
              (!unmatchedCandidates || !unmatchedCandidates.length) &&
              originalProductCodeLower
            ) {
              unmatchedCandidates =
                unmatchedRowsByProductCode[originalProductCodeLower];
            }
            if (!unmatchedCandidates || !unmatchedCandidates.length) {
              unmatchedCandidates = [];
              for (
                var fallbackIdx = 0;
                fallbackIdx < unmatchedRows.length;
                fallbackIdx++
              ) {
                var fallbackEntry = unmatchedRows[fallbackIdx];
                if (
                  fallbackEntry.matched ||
                  !fallbackEntry.descriptionLower
                ) {
                  continue;
                }
                var fallbackDescription = fallbackEntry.descriptionLower;
                if (
                  fallbackDescription.indexOf(originalDescriptionLower) !==
                    -1 ||
                  originalDescriptionLower.indexOf(fallbackDescription) !== -1
                ) {
                  unmatchedCandidates.push(fallbackEntry);
                }
              }
            }

            if (!unmatchedCandidates.length) {
              continue;
            }

            var matchedUnmatchedEntry = null;

            for (
              var candidateIdx = 0;
              candidateIdx < unmatchedCandidates.length;
              candidateIdx++
            ) {
              if (!unmatchedCandidates[candidateIdx].matched) {
                matchedUnmatchedEntry = unmatchedCandidates[candidateIdx];
                break;
              }
            }

            if (!matchedUnmatchedEntry) {
              continue;
            }

            try {
              vendorBill.selectLine({
                sublistId: "item",
                line: skippedLineIndex,
              });

              if (originalQty !== null && originalQty !== undefined) {
                vendorBill.setCurrentSublistValue({
                  sublistId: "item",
                  fieldId: "quantity",
                  value: originalQty,
                });
              }

              vendorBill.commitLine({
                sublistId: "item",
              });

              matchedLines[skippedLineIndex] = true;
              duplicateMatchedLines[skippedLineIndex] = true;
              matchedUnmatchedEntry.matched = true;
              rowMatchStatus[matchedUnmatchedEntry.rowIndex] = true;

              log.debug({
                title: "Matched duplicate line by description",
                details:
                  "Line " +
                  (skippedLineIndex + 1) +
                  " matched with originalItems row " +
                  (originalRowIndex + 1),
              });

              break;
            } catch (originalMatchError) {
              log.error({
                title:
                  "Error processing duplicate item line " + skippedLineIndex,
                details: originalMatchError,
              });
              return {
                error:
                  "Error processing duplicate item line " +
                  (skippedLineIndex + 1) +
                  ".",
              };
            }
          }
        }
      }
      // Validate after both passes; error only if rows marked critical remain unmatched
      if (unmatchedRows.length > 0) {
        var unresolvedEntry = null;
        for (
          var unresolvedIdx = 0;
          unresolvedIdx < unmatchedRows.length;
          unresolvedIdx++
        ) {
          var entry = unmatchedRows[unresolvedIdx];
          if (entry.shouldError && !entry.matched) {
            unresolvedEntry = entry;
            break;
          }
        }

        if (unresolvedEntry) {
          log.error({
            title: "No Matching Item Found",
            details:
              "No matching item found in Vendor Bill for request line index " +
              unresolvedEntry.rowIndex,
          });
          return {
            error:
              "No matching item found for request line " +
              (unresolvedEntry.rowIndex + 1) +
              " in Vendor Bill.",
          };
        }
      }

      var updatedlineCount = vendorBill.getLineCount({
        sublistId: "item",
      });
      for (var j = 0; j < updatedlineCount; j++) {
        if (!matchedLines.hasOwnProperty(j)) {
          try {
            vendorBill.selectLine({
              sublistId: "item",
              line: j,
            });

            vendorBill.setCurrentSublistValue({
              sublistId: "item",
              fieldId: "quantity",
              value: 0,
            });

            vendorBill.commitLine({
              sublistId: "item",
            });

            log.debug({
              title: "Quantity Set to 0",
              details:
                "Set quantity to 0 for line " +
                (j + 1) +
                " in Vendor Bill as it did not match any item in request.",
            });
          } catch (e) {
            log.error({
              title: "Error Setting Quantity to 0",
              details:
                "Error setting quantity to 0 for line " +
                (j + 1) +
                ": " +
                e.message,
            });
          }
        } else {
          log.debug({
            title: "Line Skipped",
            details:
              "Skipped line " +
              (j + 1) +
              " from Vendor Bill as it matched an item in request.",
          });
        }
      }

      // Set values for fields only if they are present in the request
      if (request.custbody_cseg1 && request.custbody_cseg1.id) {
        vendorBill.setValue({
          fieldId: "custbody_cseg1",
          value: request.custbody_cseg1.id,
        });
        log.debug(
          "Field custbody_cseg1 set successfully",
          request.custbody_cseg1.id
        );
      }
      if (request.custbody_supp_inv_rec_date) {
        vendorBill.setValue({
          fieldId: "custbody_supp_inv_rec_date",
          value: new Date(
            new Date().setTime(+request.custbody_supp_inv_rec_date)
          ),
        });
        log.debug(
          "Field custbody_supp_inv_rec_date set successfully",
          request.custbody_supp_inv_rec_date
        );
      }
      if (request.class && request.class.id) {
        vendorBill.setValue({
          fieldId: "class",
          value: request.class.id,
        });
        log.debug("Field class set successfully", request.class.id);
      }
      if (request.custbody_requester && request.custbody_requester.id) {
        vendorBill.setValue({
          fieldId: "custbody_requester",
          value: request.custbody_requester.id,
        });
        log.debug(
          "Field custbody_requester set successfully",
          request.custbody_requester.id
        );
      }
      if (request.custbody_expense_type && request.custbody_expense_type.id) {
        vendorBill.setValue({
          fieldId: "custbody_expense_type",
          value: request.custbody_expense_type.id,
        });
        log.debug(
          "Field custbody_expense_type set successfully",
          request.custbody_expense_type.id
        );
      }
      if (request.custbody_misc_vendor_name) {
        vendorBill.setValue({
          fieldId: "custbody_misc_vendor_name",
          value: request.custbody_misc_vendor_name,
        });
        log.debug(
          "Field custbody_misc_vendor_name set successfully",
          request.custbody_misc_vendor_name
        );
      }
      if (request.tranId) {
        vendorBill.setValue({
          fieldId: "initialtranid",
          value: request.tranId,
        });
        log.debug("initialtranid", request.tranId);
        vendorBill.setValue({
          fieldId: "tranid",
          value: request.tranId,
        });
        log.debug("initialtranid", request.tranId);
        log.debug("tranid", request.tranId);
      }
      if (
        request.custbody_approval_matrix &&
        request.custbody_approval_matrix.id
      ) {
        vendorBill.setValue({
          fieldId: "custbody_approval_matrix",
          value: request.custbody_approval_matrix.id,
        });
        log.debug(
          "Field custbody_approval_matrix set successfully",
          request.custbody_approval_matrix.id
        );
      }
      if (
        request.custbody_approval_worflow_progress &&
        request.custbody_approval_worflow_progress.id
      ) {
        vendorBill.setValue({
          fieldId: "custbody_approval_worflow_progress",
          value: request.custbody_approval_worflow_progress.id,
        });
        log.debug(
          "Field custbody_approval_worflow_progress set successfully",
          request.custbody_approval_worflow_progress.id
        );
      }
      if (request.department && request.department.id) {
        vendorBill.setValue({
          fieldId: "department",
          value: request.department.id,
        });
        log.debug("Field department set successfully", request.department.id);
      }
      if (request.custbody_intercompany !== undefined) {
        vendorBill.setValue({
          fieldId: "custbody_intercompany",
          value: request.custbody_intercompany,
        });
        log.debug(
          "Field custbody_intercompany set successfully",
          request.custbody_intercompany
        );
      }
      if (request.custbody_support_agreement_contract !== undefined) {
        vendorBill.setValue({
          fieldId: "custbody_support_agreement_contract",
          value: request.custbody_support_agreement_contract,
        });
        log.debug(
          "Field custbody_support_agreement_contract set successfully",
          request.custbody_support_agreement_contract
        );
      }

      // Save the vendor bill record after setting all fields
      var vendorBillId = vendorBill.save({
        enableSourcing: true,
        ignoreMandatoryFields: true,
      });

      // LOAD AFTER SAVE
      var updatedBill = recordModule.load({
        type: recordModule.Type.VENDOR_BILL,
        id: vendorBillId,
        isDynamic: true,
      });

      // SET AGAIN
      if (
        request.custbody_approval_worflow_progress &&
        request.custbody_approval_worflow_progress.id
      ) {
        updatedBill.setValue({
          fieldId: "custbody_approval_worflow_progress",
          value: request.custbody_approval_worflow_progress.id,
        });
        log.debug(
          "Field custbody_approval_worflow_progress set again after save",
          request.custbody_approval_worflow_progress.id
        );
      }

      // SET PENDING APPROVAL
      updatedBill.setValue({
        fieldId: "approvalstatus",
        value: 1,
      });

      // SAVE AGAIN
      updatedBill.save({
        enableSourcing: true,
        ignoreMandatoryFields: true,
      });

      log.debug(
        "Vendor Bill created successfully",
        "Vendor Bill ID: " + vendorBillId
      );

      return {
        vendorBillId: vendorBillId,
        vendorBill: vendorBill,
        purchaseOrder: purchaseOrder,
      };
    } catch (e) {
      logModule.error({
        title:
          "Error generating Vendor Bill based on Purchase Order: " +
          e.toString(),
        details: e,
      });
      return {
        error:
          "Error generating Vendor Bill based on Purchase Order: " +
          e.toString(),
        details: e.toString(),
      };
    }
  }

  function fileCreate(request) {
    if (typeof request.name === "undefined") {
      return {
        error: "No name was specified.",
      };
    }
    if (typeof request.fileType === "undefined") {
      return {
        error: "No fileType was specified.",
      };
    }
    if (typeof request.contents === "undefined") {
      return {
        error: "No content was specified.",
      };
    }
    if (typeof request.description === "undefined") {
      return {
        error: "No description was specified.",
      };
    }
    if (typeof request.encoding === "undefined") {
      return {
        error: "No encoding was specified.",
      };
    }
    if (typeof request.folderID === "undefined") {
      return {
        error: "No folderID was specified.",
      };
    }
    if (typeof request.isOnline === "undefined") {
      return {
        error: "No isOnline was specified.",
      };
    }
    if (!request.recordId) {
      return {
        error: "Record id is required.",
      };
    }
    if (!request.recordType) {
      return {
        error: "Record type is required.",
      };
    }

    try {
      var fileObj = file.create({
        name: request.name,
        fileType: request.fileType,
        contents: request.contents,
        description: request.description,
        encoding: request.encoding,
        folder: request.folderID,
        isOnline: request.isOnline,
      });

      var fileID = fileObj.save();

      fileObj = file.load({
        id: fileID,
      });

      var response = {};
      response["info"] = fileObj;
      response["content"] = fileObj.getContents();

      if (request.autoGeneratedDocument) {
        var poId = request.recordId;

        //
        var vendorBillSearch = search.create({
          type: search.Type.VENDOR_BILL,
          filters: [
            ["createdfrom", search.Operator.ANYOF, poId],
            "AND",
            ["mainline", "is", "T"],
          ],
          columns: [
            search.createColumn({
              name: "internalid",
              sort: search.Sort.DESC,
            }),
          ],
        });

        ///

        var result = vendorBillSearch.run().getRange({
          start: 0,
          end: 1,
        });

        var matchedVendorBillId;
        if (result.length > 0) {
          matchedVendorBillId = result[0].getValue({
            name: "internalid",
          });
          log.debug(
            "Vendor Bill was found",
            "Vendor Bill ID: " + matchedVendorBillId
          );
        } else {
          var errorMessage =
            "Vendor Bill for Purchase Order ID " + poId + " not found.";
          log.debug("Vendor Bill not found", errorMessage);
          return {
            error: errorMessage,
          };
        }

        var recordId = recordModule.attach({
          record: {
            type: "file",
            id: fileID,
          },
          to: {
            type: request.recordType,
            id: matchedVendorBillId,
          },
        });

        response["recordId"] = recordId;

        return response;
      } else {
        var recordId = recordModule.attach({
          record: {
            type: "file",
            id: fileID,
          },
          to: {
            type: request.recordType,
            id: request.recordId,
          },
        });

        response["recordId"] = recordId;

        return response;
      }
    } catch (e) {
      logModule.error({
        title: "Attach creating error.",
        details: e,
      });
      return {
        error: "Attach creating error.",
        details: e.toString(),
      };
    }
  }

  return {
    post: postProcess,
  };
});
