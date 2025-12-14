/**
 * @NApiVersion 2.x
 * @NScriptType Restlet
 * @NModuleScope Public
 */

define(["N/record", "N/log"], function (recordModule, log) {
  function post(request) {
    if (!request.function) {
      return { error: "No function specified" };
    }

    switch (request.function) {
      case "getExpenseReports":
        return getExpenseReports(request);
      default:
        return { error: "Unknown function" };
    }
  }

  function getExpenseReports(request) {
    try {
      if (!request.data || !Array.isArray(request.data)) {
        return { error: "data array is required" };
      }

      var result = {};

      for (var i = 0; i < request.data.length; i++) {
        var expenseReportId = request.data[i];

        if (!expenseReportId) {
          continue;
        }

        try {
          var expRec = recordModule.load({
            type: recordModule.Type.EXPENSE_REPORT,
            id: expenseReportId,
            isDynamic: false,
          });

          var statusText = expRec.getText({
            fieldId: "status",
          });
          log.debug("Expense Report Status", statusText);
          result[expenseReportId] = statusText || null;
        } catch (e) {
          log.error("Failed to load Expense Report " + expenseReportId, e);
          result[expenseReportId] = null;
        }
      }

      return {
        success: true,
        data: result,
      };
    } catch (e) {
      log.error("Error in getExpenseReports", e);
      return { error: e.toString() };
    }
  }

  return {
    post: post,
  };
});
