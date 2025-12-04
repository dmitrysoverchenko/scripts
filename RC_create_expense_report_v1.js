/**
 * @param {Object} request
 * @param {Object} request.entity — employee
 * @param {string} request.tranDate — date
 * @param {string} request.memo — header memo
 * @param {Array} request.expense.items — expense lines
 *
 * @NApiVersion 2.x
 * @NScriptType Restlet
 * @NModuleScope Public
 */

define(["N/record", "N/log", "N/file"], function (recordModule, log, file) {
  function post(request) {
    if (!request.function) {
      return { error: "No function specified" };
    }

    switch (request.function) {
      case "createExpenseReport":
        return createExpenseReport(request);
      case "fileCreate":
        return fileCreate(request);
      default:
        return { error: "Unknown function" };
    }
  }

  function convertRecordToObject(rec) {
    var out = {};

    // fields
    rec.getFields().forEach(function (fieldId) {
      try {
        out[fieldId] = rec.getValue({ fieldId: fieldId });
      } catch (e) {
        // ignore non-readable fields
      }
    });

    // sublists
    rec.getSublists().forEach(function (sublistId) {
      var lineCount = rec.getLineCount({ sublistId: sublistId });
      out[sublistId] = [];

      for (var i = 0; i < lineCount; i++) {
        var lineObj = {};
        var fields = rec.getSublistFields({ sublistId: sublistId });

        fields.forEach(function (fieldId) {
          try {
            lineObj[fieldId] = rec.getSublistValue({
              sublistId: sublistId,
              fieldId: fieldId,
              line: i,
            });
          } catch (e) {
            // field not accessible — skip
          }
        });

        out[sublistId].push(lineObj);
      }
    });

    return out;
  }

  function createExpenseReport(request) {
    try {
      log.debug("Incoming payload", JSON.stringify(request));

      if (!request.entity || !request.entity.id) {
        return { error: "entity.id is required" };
      }

      if (
        !request.expense ||
        !request.expense.items ||
        !Array.isArray(request.expense.items)
      ) {
        return { error: "expense.items array is required" };
      }

      // Create Expense Report
      var expRec = recordModule.create({
        type: recordModule.Type.EXPENSE_REPORT,
        isDynamic: true,
      });

      // HEADER FIELDS
      expRec.setValue({
        fieldId: "entity",
        value: request.entity.id,
      });

      if (request.tranDate) {
        var parts = request.tranDate.split("-"); // ["2025","11","23"]
        if (parts.length !== 3) {
          return { error: "Invalid tranDate format. Expected YYYY-MM-DD" };
        }

        var dateObj = new Date(
          parseInt(parts[0], 10),
          parseInt(parts[1], 10) - 1,
          parseInt(parts[2], 10)
        );

        if (isNaN(dateObj.getTime())) {
          return { error: "Invalid tranDate after parsing" };
        }

        expRec.setValue({
          fieldId: "trandate",
          value: dateObj,
        });
      }

      if (request.memo) {
        expRec.setValue({
          fieldId: "memo",
          value: request.memo,
        });
      }

      if (request.expensereportcurrency && request.expensereportcurrency.id) {
        expRec.setValue({
          fieldId: "expensereportcurrency",
          value: request.expensereportcurrency.id,
        });
      } else {
        expRec.setValue({
          fieldId: "expensereportcurrency",
          value: 1,
        });
      }

      // subsidiary
      // if (request.subsidiary && request.subsidiary.id) {
      //   expRec.setValue({
      //     fieldId: "subsidiary",
      //     value: request.subsidiary.id,
      //   });
      // }

      // Corporate Card by Default (checkbox expects boolean)
      // if (request.corpcardbydefault !== undefined) {
      //   expRec.setValue({
      //     fieldId: "corpcardbydefault",
      //     value:
      //       request.corpcardbydefault === "true" ||
      //       request.corpcardbydefault === true,
      //   });
      // }

      // category
      if (request.category && request.category.id) {
        expRec.setValue({
          fieldId: "category",
          value: request.category.id,
        });
      }

      // cseg1
      if (request.cseg1 && request.cseg1.id) {
        expRec.setValue({
          fieldId: "cseg1",
          value: request.cseg1.id,
        });
      }

      // cseg_jcs_spcfcf
      if (request.cseg_jcs_spcfcf && request.cseg_jcs_spcfcf.id) {
        expRec.setValue({
          fieldId: "cseg_jcs_spcfcf",
          value: request.cseg_jcs_spcfcf.id,
        });
      }

      // class
      // if (request.class && request.class.id) {
      //   expRec.setValue({
      //     fieldId: "class",
      //     value: request.class.id,
      //   });
      // }

      // department
      // if (request.department && request.department.id) {
      //   expRec.setValue({
      //     fieldId: "department",
      //     value: request.department.id,
      //   });
      // }

      // csegcseg_jcs_evtprg
      if (request.csegcseg_jcs_evtprg && request.csegcseg_jcs_evtprg.id) {
        expRec.setValue({
          fieldId: "csegcseg_jcs_evtprg",
          value: request.csegcseg_jcs_evtprg.id,
        });
      }

      // Budget Owner
      if (
        request.custbody_jcs_budgetowner &&
        request.custbody_jcs_budgetowner.id
      ) {
        expRec.setValue({
          fieldId: "custbody_jcs_budgetowner",
          value: request.custbody_jcs_budgetowner.id,
        });
      }

      // Budget Category (text)
      if (request.budgetCategory) {
        expRec.setValue({
          fieldId: "custbody_jcs_budgetcategory",
          value: request.budgetCategory,
        });
      }

      // IT Endorse
      if (
        request.custbody_jcs_it_endorse_employee &&
        request.custbody_jcs_it_endorse_employee.id
      ) {
        expRec.setValue({
          fieldId: "custbody_jcs_it_endorse_employee",
          value: request.custbody_jcs_it_endorse_employee.id,
        });
      }

      // Facility Service Endorse
      if (
        request.custbody_jcs_fs_endorse_employee &&
        request.custbody_jcs_fs_endorse_employee.id
      ) {
        expRec.setValue({
          fieldId: "custbody_jcs_fs_endorse_employee",
          value: request.custbody_jcs_fs_endorse_employee.id,
        });
      }

      // Approvers
      if (
        request.custbody_jcs_level1_approver &&
        request.custbody_jcs_level1_approver.id
      ) {
        expRec.setValue({
          fieldId: "custbody_jcs_level1_approver",
          value: request.custbody_jcs_level1_approver.id,
        });
      }

      if (
        request.custbody_jcs_level2_approver &&
        request.custbody_jcs_level2_approver.id
      ) {
        expRec.setValue({
          fieldId: "custbody_jcs_level2_approver",
          value: request.custbody_jcs_level2_approver.id,
        });
      }

      // Exchange Rate
      if (request.expensereportexchangerate) {
        expRec.setValue({
          fieldId: "expensereportexchangerate",
          value: request.expensereportexchangerate,
        });
      }

      // SUBLIST LINES
      var items = request.expense.items;

      for (var i = 0; i < items.length; i++) {
        var line = items[i];

        expRec.selectNewLine({ sublistId: "expense" });

        // if (line.category && line.category.id) {
        //   expRec.setCurrentSublistValue({
        //     sublistId: "expense",
        //     fieldId: "category",
        //     value: line.category.id,
        //   });
        // }

        if (line.expensedate) {
          var lineParts = line.expensedate.split("-"); // ["2025","11","23"]
          if (lineParts.length !== 3) {
            return { error: "Invalid tranDate format. Expected YYYY-MM-DD" };
          }

          var dateLineObj = new Date(
            parseInt(lineParts[0], 10),
            parseInt(lineParts[1], 10) - 1,
            parseInt(lineParts[2], 10)
          );

          if (isNaN(dateLineObj.getTime())) {
            return { error: "Invalid tranDate after parsing" };
          }

          expRec.setCurrentSublistValue({
            sublistId: "expense",
            fieldId: "expensedate",
            value: dateLineObj,
          });
        }

        if (line.expenseaccount && line.expenseaccount.id) {
          expRec.setCurrentSublistValue({
            sublistId: "expense",
            fieldId: "expenseaccount",
            value: line.expenseaccount.id,
          });
        }

        if (line.department && line.department.id) {
          expRec.setCurrentSublistValue({
            sublistId: "expense",
            fieldId: "department",
            value: line.department.id,
          });
        }

        if (line.taxCode && line.taxCode.id) {
          expRec.setCurrentSublistValue({
            sublistId: "expense",
            fieldId: "taxcode",
            value: line.taxCode.id,
          });
        }

        if (line.currency && line.currency.id) {
          expRec.setCurrentSublistValue({
            sublistId: "expense",
            fieldId: "currency",
            value: line.currency.id,
          });
        }

        if (line.memo) {
          expRec.setCurrentSublistValue({
            sublistId: "expense",
            fieldId: "memo",
            value: line.memo,
          });
        }

        if (line.class && line.class.id) {
          expRec.setCurrentSublistValue({
            sublistId: "expense",
            fieldId: "class",
            value: line.class.id,
          });
        }

        // Custom Segments
        if (line.cseg1 && line.cseg1.id) {
          expRec.setCurrentSublistValue({
            sublistId: "expense",
            fieldId: "cseg1",
            value: line.cseg1.id,
          });
        }

        if (line.cseg_jcs_spcfcf && line.cseg_jcs_spcfcf.id) {
          expRec.setCurrentSublistValue({
            sublistId: "expense",
            fieldId: "cseg_jcs_spcfcf",
            value: line.cseg_jcs_spcfcf.id,
          });
        }

        if (line.csegcseg_jcs_evtprg && line.csegcseg_jcs_evtprg.id) {
          expRec.setCurrentSublistValue({
            sublistId: "expense",
            fieldId: "csegcseg_jcs_evtprg",
            value: line.csegcseg_jcs_evtprg.id,
          });
        }

        if (line.amount) {
          expRec.setCurrentSublistValue({
            sublistId: "expense",
            fieldId: "amount",
            value: line.amount,
          });
        }

        expRec.commitLine({ sublistId: "expense" });
      }

      var expenseReportId = expRec.save({
        enableSourcing: true,
        ignoreMandatoryFields: false,
      });

      log.debug("Expense Report created", expenseReportId);

      // ---- Load full record
      var loaded = recordModule.load({
        type: recordModule.Type.EXPENSE_REPORT,
        id: expenseReportId,
        isDynamic: false,
      });

      // ---- Convert record to plain JS object
      var result = convertRecordToObject(loaded);

      return {
        success: true,
        expenseReportId: expenseReportId,
        record: result,
      };
    } catch (e) {
      log.error("Error creating Expense Report", e);
      return { error: e.toString() };
    }
  }

  function fileCreate(request) {
    if (typeof request.name === "undefined") {
      return { error: "No name was specified." };
    }
    if (typeof request.fileType === "undefined") {
      return { error: "No fileType was specified." };
    }
    if (typeof request.contents === "undefined") {
      return { error: "No content was specified." };
    }
    if (typeof request.description === "undefined") {
      return { error: "No description was specified." };
    }
    if (typeof request.encoding === "undefined") {
      return { error: "No encoding was specified." };
    }
    if (typeof request.folderID === "undefined") {
      return { error: "No folderID was specified." };
    }
    if (typeof request.isOnline === "undefined") {
      return { error: "No isOnline was specified." };
    }
    if (!request.recordId) {
      return { error: "Record id is required." };
    }
    if (!request.recordType) {
      return { error: "Record type is required." };
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

      log.debug("Created file ID", fileID);

      fileObj = file.load({ id: fileID });

      var response = {};
      response["info"] = fileObj;
      response["content"] = fileObj.getContents();
      response["fileID"] = fileID;

      if (request.setToLines) {
        var expRecord = recordModule.load({
          type: recordModule.Type.EXPENSE_REPORT,
          id: request.recordId,
          isDynamic: false,
        });

        var lineCount = expRecord.getLineCount({ sublistId: "expense" });

        for (var i = 0; i < lineCount; i++) {
          expRecord.setSublistValue({
            sublistId: "expense",
            fieldId: "expmediaitem",
            line: i,
            value: fileID,
          });
        }

        expRecord.save({ enableSourcing: false, ignoreMandatoryFields: true });
      } else {
        var recdId = recordModule.attach({
          record: {
            type: "file",
            id: fileID,
          },
          to: {
            type: request.recordType,
            id: request.recordId,
          },
        });
        response["recordId"] = recdId;
      }
      return response;
    } catch (e) {
      log.error({
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
    post: post,
  };
});
