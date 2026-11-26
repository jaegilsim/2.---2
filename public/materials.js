const body = document.querySelector("#materials-body");
      const count = document.querySelector("#material-count");
      const search = document.querySelector("#search");
      const refresh = document.querySelector("#refresh");
      const status = document.querySelector("#status");
      const materialSelect = document.querySelector("#material-select");
      const materialDensity = document.querySelector("#material-density");
      const selectionMessage = document.querySelector("#selection-message");
      const volumeInput = document.querySelector("#volume");
      const quantityInput = document.querySelector("#quantity");
      const volumeError = document.querySelector("#volume-error");
      const quantityError = document.querySelector("#quantity-error");
      const unitWeightOutput = document.querySelector("#unit-weight");
      const totalWeightOutput = document.querySelector("#total-weight");
      const calculationMessage = document.querySelector("#calculation-message");
      const requestIdInput = document.querySelector("#request-id");
      const saveOrderButton = document.querySelector("#save-order");
      const orderMessage = document.querySelector("#order-message");
      const ordersStatus = document.querySelector("#orders-status");
      const ordersBody = document.querySelector("#orders-body");
      const deleteOrderDialog = document.querySelector("#delete-order-dialog");
      const deleteOrderId = document.querySelector("#delete-order-id");
      const deleteOrderCustomer = document.querySelector("#delete-order-customer");
      const deleteOrderItem = document.querySelector("#delete-order-item");
      const deleteOrderStatus = document.querySelector("#delete-order-status");
      const confirmDeleteOrderButton = document.querySelector("#confirm-delete-order");
      const cancelDeleteOrderButton = document.querySelector("#cancel-delete-order");
      const closeDeleteOrderButton = document.querySelector("#close-delete-order");
      const mailPreviewDialog = document.querySelector("#mail-preview-dialog");
      const mailPreviewRequestId = document.querySelector("#mail-preview-request-id");
      const mailPreviewOrderSummary = document.querySelector("#mail-preview-order-summary");
      const mailRecipient = document.querySelector("#mail-recipient");
      const mailSubject = document.querySelector("#mail-subject");
      const mailBody = document.querySelector("#mail-body");
      const mailPreviewStatus = document.querySelector("#mail-preview-status");
      const mailDownloadRow = document.querySelector("#mail-download-row");
      const mailDownloadLink = document.querySelector("#mail-download-link");
      const createMailPreviewButton = document.querySelector("#create-mail-preview");
      const sendMailButton = document.querySelector("#send-mail");
      const cancelMailPreviewButton = document.querySelector("#cancel-mail-preview");
      const closeMailPreviewButton = document.querySelector("#close-mail-preview");
      const selectedItemName = document.querySelector("#selected-item-name");
      const selectedItemDetails = document.querySelector("#selected-item-details");
      const selectedCustomerName = document.querySelector("#selected-customer-name");
      const selectedCustomerDetails = document.querySelector("#selected-customer-details");
      const itemDialog = document.querySelector("#item-dialog");
      const openItemDialogButton = document.querySelector("#open-item-dialog");
      const closeItemDialogButton = document.querySelector("#close-item-dialog");
      const cancelItemSelectionButton = document.querySelector("#cancel-item-selection");
      const itemSearch = document.querySelector("#item-search");
      const itemSearchStatus = document.querySelector("#item-search-status");
      const itemResultsBody = document.querySelector("#item-results-body");
      const customerDialog = document.querySelector("#customer-dialog");
      const openCustomerDialogButton = document.querySelector("#open-customer-dialog");
      const closeCustomerDialogButton = document.querySelector("#close-customer-dialog");
      const cancelCustomerSelectionButton = document.querySelector("#cancel-customer-selection");
      const customerSearch = document.querySelector("#customer-search");
      const customerSearchStatus = document.querySelector("#customer-search-status");
      const customerResultsBody = document.querySelector("#customer-results-body");
      let materials = [];
      let loadState = "loading";
      let itemSearchTimer = null;
      let itemSearchSequence = 0;
      let customerSearchTimer = null;
      let customerSearchSequence = 0;
      let selectedCustomer = null;
      let selectedItem = null;
      let selectedMaterialCode = "";
      let currentRequestId = "";
      let savedOrders = [];
      let isSavingOrder = false;
      let pendingDeleteOrder = null;
      let isDeletingOrder = false;
      let pendingMailOrder = null;
      let isCreatingMailPreview = false;
      let isSendingMail = false;
      let mailPreviewSequence = 0;
      let draftLoadError = "";
      const draftStorageKey = "quote-order-draft-v1";

      function updateSelectedDensity() {
        const selected = materials.find(
          (material) => material.materialCode === materialSelect.value,
        );
        materialDensity.value = selected
          ? new Intl.NumberFormat("ko-KR", { maximumFractionDigits: 4 }).format(
              selected.calculationDensityGPerCm3,
            )
          : "";
      }

      function renderDropdown(selectedCode = "") {
        materialSelect.replaceChildren();
        const placeholder = document.createElement("option");
        placeholder.value = "";
        placeholder.textContent =
          loadState === "error"
            ? "재질 조회 실패"
            : loadState === "empty"
              ? "등록된 재질이 없습니다."
              : loadState === "loading"
                ? "재질 목록을 불러오는 중입니다."
                : "재질을 선택하세요.";
        materialSelect.append(placeholder);

        if (loadState === "ready") {
          for (const material of materials) {
            const option = document.createElement("option");
            option.value = material.materialCode;
            option.textContent = material.materialName;
            materialSelect.append(option);
          }
        }

        materialSelect.disabled = loadState !== "ready";
        if (materials.some((material) => material.materialCode === selectedCode)) {
          materialSelect.value = selectedCode;
        }
        updateSelectedDensity();
      }

      function setFieldError(input, messageElement, message) {
        messageElement.textContent = message;
        input.setAttribute("aria-invalid", message ? "true" : "false");
      }

      function recalculateWeights() {
        unitWeightOutput.value = "";
        totalWeightOutput.value = "";
        setFieldError(volumeInput, volumeError, "");
        setFieldError(quantityInput, quantityError, "");

        if (loadState === "error" || loadState === "empty" || loadState === "loading") {
          calculationMessage.className =
            loadState === "error" ? "notice error" : "notice";
          calculationMessage.textContent =
            loadState === "error"
              ? "재질 목록 조회에 실패해 계산할 수 없습니다."
              : loadState === "empty"
                ? "선택 가능한 재질이 없어 계산할 수 없습니다."
                : "재질 목록을 불러오는 중입니다.";
          return;
        }

        const hasStarted = Boolean(
          materialSelect.value || volumeInput.value !== "" || quantityInput.value !== "",
        );
        if (!hasStarted) {
          calculationMessage.className = "notice";
          calculationMessage.textContent =
            "재질, 부피, 수량을 입력하면 자동으로 계산됩니다.";
          return;
        }

        const material = materials.find(
          (item) => item.materialCode === materialSelect.value,
        );
        const volume = volumeInput.valueAsNumber;
        const quantity = quantityInput.valueAsNumber;
        const volumeMessage =
          volumeInput.value === ""
            ? "부피를 입력해 주세요."
            : !Number.isFinite(volume) || volume <= 0
              ? "부피는 양수로 입력해 주세요."
              : "";
        const quantityMessage =
          quantityInput.value === ""
            ? "수량을 입력해 주세요."
            : !Number.isInteger(quantity) || quantity <= 0
              ? "수량은 양의 정수로 입력해 주세요."
              : "";

        setFieldError(volumeInput, volumeError, volumeMessage);
        setFieldError(quantityInput, quantityError, quantityMessage);

        if (!material || volumeMessage || quantityMessage) {
          calculationMessage.className = "notice error";
          calculationMessage.textContent = [
            !material ? "재질을 선택해 주세요." : "",
            volumeMessage,
            quantityMessage,
          ].filter(Boolean).join(" ");
          return;
        }

        const unitWeight = volume * material.calculationDensityGPerCm3 / 1000;
        const totalWeight = unitWeight * quantity;
        if (!Number.isFinite(unitWeight) || !Number.isFinite(totalWeight)) {
          calculationMessage.className = "notice error";
          calculationMessage.textContent = "입력값이 너무 커서 중량을 계산할 수 없습니다.";
          return;
        }

        const formatter = new Intl.NumberFormat("ko-KR", { maximumFractionDigits: 4 });
        unitWeightOutput.value = formatter.format(unitWeight);
        totalWeightOutput.value = formatter.format(totalWeight);
        calculationMessage.className = "notice";
        calculationMessage.textContent = "계산 결과가 입력값에 따라 갱신되었습니다.";
      }

      function setOrderMessage(message, isError = false) {
        orderMessage.className = isError ? "notice error" : "notice";
        orderMessage.textContent = message;
      }

      function isStoredSelection(value, fields) {
        return value === null || (
          value &&
          typeof value === "object" &&
          fields.every((field) => typeof value[field] === "string")
        );
      }

      function readSavedDraft() {
        try {
          const serialized = localStorage.getItem(draftStorageKey);
          if (!serialized) {
            return null;
          }
          const draft = JSON.parse(serialized);
          const validRequestId =
            draft.requestId === "" ||
            (typeof draft.requestId === "string" &&
              /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(draft.requestId));
          if (
            !draft ||
            typeof draft !== "object" ||
            !validRequestId ||
            !isStoredSelection(draft.customer, ["customerCode", "customerName", "contactPerson"]) ||
            !isStoredSelection(draft.item, ["itemCode", "itemName", "spec"]) ||
            typeof draft.materialCode !== "string" ||
            typeof draft.volume !== "string" ||
            typeof draft.quantity !== "string"
          ) {
            throw new Error("저장된 입력 형식이 올바르지 않습니다.");
          }
          return draft;
        } catch (error) {
          draftLoadError = error.message;
          return null;
        }
      }

      function createRequestId() {
        if (!window.crypto || typeof window.crypto.randomUUID !== "function") {
          throw new Error("이 브라우저에서 안전한 요청 ID를 만들 수 없습니다.");
        }
        return window.crypto.randomUUID();
      }

      function currentOrderValues() {
        return {
          customerCode: selectedCustomer ? selectedCustomer.customerCode : "",
          itemCode: selectedItem ? selectedItem.itemCode : "",
          materialCode: selectedMaterialCode || materialSelect.value,
          volumeCm3: Number(volumeInput.value),
          quantity: Number(quantityInput.value),
        };
      }

      function hasDraftValues(values) {
        return Boolean(
          values.customerCode ||
          values.itemCode ||
          values.materialCode ||
          volumeInput.value ||
          quantityInput.value,
        );
      }

      function orderMatchesCurrentValues(order) {
        const values = currentOrderValues();
        return (
          order.customerCode === values.customerCode &&
          order.itemCode === values.itemCode &&
          order.materialCode === values.materialCode &&
          order.volumeCm3 === values.volumeCm3 &&
          order.quantity === values.quantity
        );
      }

      function updateRequestId() {
        if (currentRequestId) {
          const saved = savedOrders.find((order) => order.requestId === currentRequestId);
          if (saved && !orderMatchesCurrentValues(saved)) {
            currentRequestId = createRequestId();
          }
        }
        if (!currentRequestId && hasDraftValues(currentOrderValues())) {
          currentRequestId = createRequestId();
        }
        requestIdInput.value = currentRequestId;
      }

      function saveDraft() {
        try {
          updateRequestId();
          localStorage.setItem(draftStorageKey, JSON.stringify({
            requestId: currentRequestId,
            customer: selectedCustomer,
            item: selectedItem,
            materialCode: selectedMaterialCode || materialSelect.value,
            volume: volumeInput.value,
            quantity: quantityInput.value,
          }));
          setOrderMessage("입력값과 요청 ID가 이 브라우저에 보관되었습니다.");
          return true;
        } catch (error) {
          setOrderMessage(`입력값을 보관하지 못했습니다: ${error.message}`, true);
          return false;
        }
      }

      function restoreDraft(draft) {
        if (!draft) {
          if (draftLoadError) {
            setOrderMessage(`이전 입력을 복원하지 못했습니다: ${draftLoadError}`, true);
          }
          return;
        }

        currentRequestId = draft.requestId;
        selectedCustomer = draft.customer;
        selectedItem = draft.item;
        selectedMaterialCode = draft.materialCode;
        volumeInput.value = draft.volume;
        quantityInput.value = draft.quantity;
        requestIdInput.value = currentRequestId;

        if (selectedCustomer) {
          selectedCustomerName.textContent = selectedCustomer.customerName;
          selectedCustomerDetails.textContent =
            `${selectedCustomer.customerCode} · 담당자 ${selectedCustomer.contactPerson}`;
        }
        if (selectedItem) {
          selectedItemName.textContent = selectedItem.itemName;
          selectedItemDetails.textContent =
            `${selectedItem.itemCode} · ${selectedItem.spec}`;
        }

        const materialIsActive = materials.some(
          (material) => material.materialCode === selectedMaterialCode,
        );
        if (materialIsActive) {
          materialSelect.value = selectedMaterialCode;
        } else if (selectedMaterialCode) {
          selectionMessage.className = "notice error";
          selectionMessage.textContent =
            `저장된 재질코드 ${selectedMaterialCode}를 현재 목록에서 찾을 수 없습니다. 다른 재질을 선택해 주세요.`;
        }
        updateSelectedDensity();
        recalculateWeights();
        setOrderMessage("이전 입력값과 요청 ID를 복원했습니다.");
      }

      function appendOrderCell(row, code, name, detail) {
        const cell = document.createElement("td");
        const codeText = document.createElement("span");
        codeText.className = "order-code";
        codeText.textContent = code;
        const nameText = document.createElement("span");
        nameText.textContent = name;
        const detailText = document.createElement("span");
        detailText.className = "order-detail";
        detailText.textContent = detail;
        cell.append(codeText, nameText, detailText);
        row.append(cell);
      }

      function appendOrderValueCell(row, value, detail) {
        const cell = document.createElement("td");
        cell.textContent = value;
        const detailText = document.createElement("span");
        detailText.className = "order-detail";
        detailText.textContent = detail;
        cell.append(detailText);
        row.append(cell);
      }

      function renderOrders() {
        ordersBody.replaceChildren();
        if (savedOrders.length === 0) {
          const row = document.createElement("tr");
          const cell = document.createElement("td");
          cell.colSpan = 8;
          cell.className = "state";
          cell.textContent = "저장된 견적이 없습니다.";
          row.append(cell);
          ordersBody.append(row);
          ordersStatus.className = "notice";
          ordersStatus.textContent = "저장된 견적 0건";
          return;
        }

        const formatter = new Intl.NumberFormat("ko-KR", { maximumFractionDigits: 4 });
        for (const order of [...savedOrders].reverse()) {
          const row = document.createElement("tr");
          const requestCell = document.createElement("td");
          const requestId = document.createElement("span");
          const receivedAt = document.createElement("span");
          requestId.className = "order-request-id";
          requestId.textContent = order.requestId;
          receivedAt.className = "order-detail";
          receivedAt.textContent = new Date(order.receivedAt).toLocaleString("ko-KR");
          requestCell.append(requestId, receivedAt);
          row.append(requestCell);
          appendOrderCell(
            row,
            order.customerCode,
            order.customerName,
            `담당자 ${order.contactPerson}`,
          );
          appendOrderCell(
            row,
            order.itemCode,
            order.itemName,
            order.specification,
          );
          appendOrderCell(
            row,
            order.materialCode,
            order.materialName,
            `${formatter.format(order.appliedDensityGPerCm3)} g/cm³`,
          );
          appendOrderValueCell(
            row,
            `${formatter.format(order.volumeCm3)} cm³`,
            `수량 ${formatter.format(order.quantity)}`,
          );
          appendOrderValueCell(row, `${formatter.format(order.unitWeightKg)} kg`, "");
          appendOrderValueCell(row, `${formatter.format(order.totalWeightKg)} kg`, "");
          const actionCell = document.createElement("td");
          const actionButtons = document.createElement("div");
          actionButtons.className = "order-action-buttons";
          const mailButton = document.createElement("button");
          mailButton.type = "button";
          mailButton.className = "mail-preview-button";
          mailButton.textContent = "메일 미리보기";
          mailButton.dataset.requestId = order.requestId;
          mailButton.setAttribute("aria-label", `${order.requestId} 메일 미리보기`);
          mailButton.addEventListener("click", (event) => {
            openMailPreview(event.currentTarget.dataset.requestId);
          });
          const deleteButton = document.createElement("button");
          deleteButton.type = "button";
          deleteButton.className = "delete-order-button";
          deleteButton.textContent = "삭제";
          deleteButton.dataset.requestId = order.requestId;
          deleteButton.setAttribute("aria-label", `${order.requestId} 견적 삭제`);
          deleteButton.addEventListener("click", (event) => {
            openDeleteConfirmation(event.currentTarget.dataset.requestId);
          });
          actionButtons.append(mailButton, deleteButton);
          actionCell.append(actionButtons);
          row.append(actionCell);
          ordersBody.append(row);
        }
        ordersStatus.className = "notice";
        ordersStatus.textContent = `저장된 견적 ${savedOrders.length}건`;
      }

      async function loadOrders() {
        ordersStatus.className = "notice";
        ordersStatus.textContent = "저장된 요청을 조회하고 있습니다.";
        try {
          const response = await fetch("/api/orders", {
            headers: { Accept: "application/json" },
          });
          if (!response.ok) {
            throw new Error(`서버 응답 오류 (${response.status})`);
          }
          const data = await response.json();
          if (
            !Array.isArray(data.orders) ||
            data.orders.some((order) =>
              !order ||
              typeof order.requestId !== "string" ||
              typeof order.customerCode !== "string" ||
              typeof order.customerName !== "string" ||
              typeof order.itemCode !== "string" ||
              typeof order.itemName !== "string" ||
              typeof order.materialCode !== "string" ||
              typeof order.materialName !== "string" ||
              typeof order.appliedDensityGPerCm3 !== "number" ||
              typeof order.volumeCm3 !== "number" ||
              typeof order.quantity !== "number" ||
              typeof order.unitWeightKg !== "number" ||
              typeof order.totalWeightKg !== "number"
            )
          ) {
            throw new Error("저장된 견적 응답 형식이 올바르지 않습니다.");
          }
          savedOrders = data.orders;
          renderOrders();
          if (currentRequestId) {
            updateRequestId();
            saveDraft();
            const existing = savedOrders.find(
              (order) => order.requestId === currentRequestId,
            );
            if (existing) {
              setOrderMessage("이 요청 ID와 입력값은 이미 서버에 저장되어 있습니다.");
            }
          }
          return true;
        } catch (error) {
          ordersStatus.className = "notice error";
          ordersStatus.textContent = `저장된 견적 조회 실패: ${error.message}`;
          return false;
        }
      }

      function setMailPreviewStatus(message, isError = false) {
        mailPreviewStatus.className = isError
          ? "item-search-status error"
          : "item-search-status";
        mailPreviewStatus.textContent = message;
      }

      function applyMailDeliveryStatus(delivery) {
        if (!delivery) {
          sendMailButton.disabled = false;
          return;
        }

        if (delivery.status === "sent") {
          sendMailButton.disabled = true;
          setMailPreviewStatus(
            `이 요청은 ${delivery.sentAt} SMTP 서버에서 접수했습니다. 같은 요청 ID로는 다시 보내지 않습니다.`,
          );
        } else if (delivery.status === "sending") {
          sendMailButton.disabled = true;
          setMailPreviewStatus("이 요청은 SMTP 발송 처리 중입니다. 중복 방지를 위해 재발송을 잠갔습니다.");
        } else if (delivery.status === "uncertain") {
          sendMailButton.disabled = true;
          setMailPreviewStatus(
            "SMTP 발송 결과를 확인할 수 없습니다. 중복 발송 방지를 위해 잠겼습니다. SMTP 제공자 기록을 확인해 주세요.",
            true,
          );
        } else if (delivery.status === "failed" && delivery.retryable) {
          sendMailButton.disabled = false;
          setMailPreviewStatus("SMTP 발송 전에 실패했습니다. 설정을 확인한 뒤 다시 시도할 수 있습니다.", true);
        } else {
          sendMailButton.disabled = true;
          setMailPreviewStatus("발송 상태를 확인할 수 없어 중복 방지를 위해 재발송을 잠갔습니다.", true);
        }
      }

      async function openMailPreview(requestId) {
        const order = savedOrders.find((entry) => entry.requestId === requestId);
        if (!order) {
          ordersStatus.className = "notice error";
          ordersStatus.textContent = "미리보기할 견적이 목록에 없습니다. 목록을 다시 불러와 주세요.";
          return;
        }

        pendingMailOrder = order;
        const sequence = ++mailPreviewSequence;
        mailPreviewRequestId.textContent = order.requestId;
        mailPreviewOrderSummary.textContent =
          `${order.customerCode} · ${order.customerName} / ${order.itemCode} · ${order.itemName}`;
        mailRecipient.value = "";
        mailRecipient.disabled = true;
        mailSubject.value = "";
        mailBody.value = "";
        mailDownloadLink.removeAttribute("href");
        mailDownloadLink.removeAttribute("download");
        mailDownloadRow.hidden = true;
        createMailPreviewButton.disabled = true;
        sendMailButton.disabled = true;
        setMailPreviewStatus("저장된 견적을 바탕으로 서버에서 본문을 만들고 있습니다.");
        mailPreviewDialog.showModal();

        try {
          const response = await fetch(
            `/api/orders/${encodeURIComponent(requestId)}/mail-preview`,
            { headers: { Accept: "application/json" } },
          );
          const result = await response.json();
          if (!response.ok) {
            throw new Error(result.error || `서버 응답 오류 (${response.status})`);
          }
          if (
            sequence !== mailPreviewSequence ||
            !result.preview ||
            result.preview.requestId !== requestId ||
            typeof result.preview.subject !== "string" ||
            typeof result.preview.body !== "string" ||
            typeof result.preview.existing !== "boolean" ||
            typeof result.preview.recipient !== "string" ||
            typeof result.preview.fileName !== "string" ||
            typeof result.preview.downloadUrl !== "string" ||
            (
              result.preview.delivery !== null &&
              (
                !result.preview.delivery ||
                !["sending", "sent", "failed", "uncertain"].includes(result.preview.delivery.status) ||
                typeof result.preview.delivery.recipient !== "string" ||
                typeof result.preview.delivery.sentAt !== "string" ||
                typeof result.preview.delivery.messageId !== "string" ||
                typeof result.preview.delivery.retryable !== "boolean"
              )
            )
          ) {
            if (sequence === mailPreviewSequence) {
              throw new Error("미리보기 응답 형식이 올바르지 않습니다.");
            }
            return;
          }

          mailSubject.value = result.preview.subject;
          mailBody.value = result.preview.body;
          if (result.preview.existing) {
            mailRecipient.value = result.preview.recipient;
            mailRecipient.disabled = true;
            mailDownloadLink.href = result.preview.downloadUrl;
            mailDownloadLink.download = result.preview.fileName;
            mailDownloadRow.hidden = false;
            setMailPreviewStatus(
              "이 요청 ID의 미리보기 파일이 이미 있습니다. 중복 생성 없이 기존 파일을 다시 받을 수 있습니다.",
            );
          } else {
            mailRecipient.disabled = false;
            setMailPreviewStatus("수신자 1명과 저장 기록에서 만든 제목·본문을 확인해 주세요.");
          }
          createMailPreviewButton.disabled = false;
          applyMailDeliveryStatus(result.preview.delivery);
        } catch (error) {
          if (sequence === mailPreviewSequence) {
            setMailPreviewStatus(`미리보기 조회 실패: ${error.message}`, true);
          }
        }
      }

      async function createMailPreview() {
        if (!pendingMailOrder || isCreatingMailPreview) {
          return;
        }

        const recipient = mailRecipient.value.trim();
        if (!recipient || recipient.includes(",") || recipient.includes(";") || !mailRecipient.checkValidity()) {
          setMailPreviewStatus("수신자 이메일 주소를 한 명만 입력해 주세요.", true);
          mailRecipient.focus();
          return;
        }
        if (!mailSubject.value || !mailBody.value) {
          setMailPreviewStatus("서버가 만든 제목과 본문을 먼저 불러와 주세요.", true);
          return;
        }

        const recipientWasDisabled = mailRecipient.disabled;
        isCreatingMailPreview = true;
        createMailPreviewButton.disabled = true;
        mailRecipient.disabled = true;
        cancelMailPreviewButton.disabled = true;
        closeMailPreviewButton.disabled = true;
        setMailPreviewStatus("메일 API에 미리보기를 요청하고 .eml 파일을 만들고 있습니다.");

        try {
          const response = await fetch("/api/mail-previews", {
            method: "POST",
            headers: {
              Accept: "application/json",
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              requestId: pendingMailOrder.requestId,
              recipient,
              subject: mailSubject.value,
              body: mailBody.value,
            }),
          });
          const result = await response.json();
          if (!response.ok) {
            throw new Error(result.error || `서버 응답 오류 (${response.status})`);
          }
          if (
            result.requestId !== pendingMailOrder.requestId ||
            result.sent !== false ||
            result.previewOnly !== true ||
            typeof result.duplicate !== "boolean" ||
            typeof result.downloadUrl !== "string" ||
            typeof result.fileName !== "string"
          ) {
            throw new Error("미리보기 API 응답 형식이 올바르지 않습니다.");
          }

          mailDownloadLink.href = result.downloadUrl;
          mailDownloadLink.download = result.fileName;
          mailDownloadRow.hidden = false;
          mailRecipient.value = recipient;
          mailRecipient.disabled = true;
          setMailPreviewStatus(
            result.duplicate
              ? "이미 생성된 동일한 .eml 미리보기입니다. 실제 메일은 발송되지 않았습니다."
              : ".eml 미리보기 파일을 만들었습니다. 실제 메일은 발송되지 않았습니다.",
          );
        } catch (error) {
          mailRecipient.disabled = recipientWasDisabled;
          createMailPreviewButton.disabled = false;
          setMailPreviewStatus(
            `미리보기 생성 실패: ${error.message} 저장된 견적과 입력값은 변경되지 않았습니다.`,
            true,
          );
        } finally {
          isCreatingMailPreview = false;
          cancelMailPreviewButton.disabled = false;
          closeMailPreviewButton.disabled = false;
        }
      }

      async function sendMail() {
        if (!pendingMailOrder || isSendingMail) {
          return;
        }

        const recipient = mailRecipient.value.trim();
        if (!recipient || recipient.includes(",") || recipient.includes(";") || !mailRecipient.checkValidity()) {
          setMailPreviewStatus("수신자 이메일 주소를 한 명만 입력해 주세요.", true);
          mailRecipient.focus();
          return;
        }
        if (!mailSubject.value || !mailBody.value) {
          setMailPreviewStatus("서버가 만든 제목과 본문을 먼저 불러와 주세요.", true);
          return;
        }
        const confirmed = window.confirm(
          `SMTP를 통해 실제 메일을 발송합니다.\n\n요청 ID: ${pendingMailOrder.requestId}\n수신자: ${recipient}\n제목: ${mailSubject.value}\n\n계속 진행하시겠습니까?`,
        );
        if (!confirmed) {
          return;
        }

        const recipientWasDisabled = mailRecipient.disabled;
        const previewButtonWasDisabled = createMailPreviewButton.disabled;
        isSendingMail = true;
        sendMailButton.disabled = true;
        createMailPreviewButton.disabled = true;
        mailRecipient.disabled = true;
        cancelMailPreviewButton.disabled = true;
        closeMailPreviewButton.disabled = true;
        setMailPreviewStatus("SMTP 발송을 요청했습니다. 결과를 확인하는 동안 버튼을 잠급니다.");

        try {
          const response = await fetch("/api/mail", {
            method: "POST",
            headers: {
              Accept: "application/json",
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              requestId: pendingMailOrder.requestId,
              recipient,
              subject: mailSubject.value,
              body: mailBody.value,
            }),
          });
          const result = await response.json();
          if (!response.ok) {
            const error = new Error(result.error || `서버 응답 오류 (${response.status})`);
            error.retryable = result.retryable;
            throw error;
          }
          if (
            result.requestId !== pendingMailOrder.requestId ||
            result.sent !== true ||
            result.smtpAccepted !== true ||
            typeof result.duplicate !== "boolean" ||
            typeof result.messageId !== "string"
          ) {
            throw new Error("SMTP 발송 API 응답 형식이 올바르지 않습니다.");
          }

          mailRecipient.disabled = true;
          sendMailButton.disabled = true;
          setMailPreviewStatus(
            result.duplicate
              ? "이 요청 ID는 이미 SMTP 서버에서 접수했습니다. 중복 발송하지 않았습니다."
              : "SMTP 서버가 메일을 접수했습니다. 수신함 도착까지는 제공자 처리에 따라 달라질 수 있습니다.",
          );
        } catch (error) {
          mailRecipient.disabled = recipientWasDisabled;
          sendMailButton.disabled = error.retryable === false;
          setMailPreviewStatus(
            `SMTP 발송 실패: ${error.message} 저장된 견적과 입력값은 변경되지 않았습니다.`,
            true,
          );
        } finally {
          isSendingMail = false;
          createMailPreviewButton.disabled = previewButtonWasDisabled;
          cancelMailPreviewButton.disabled = false;
          closeMailPreviewButton.disabled = false;
        }
      }

      function openDeleteConfirmation(requestId) {
        const order = savedOrders.find((entry) => entry.requestId === requestId);
        if (!order) {
          ordersStatus.className = "notice error";
          ordersStatus.textContent = "삭제할 견적이 목록에 없습니다. 목록을 다시 불러와 주세요.";
          return;
        }

        pendingDeleteOrder = order;
        deleteOrderId.textContent = order.requestId;
        deleteOrderCustomer.textContent = `${order.customerCode} · ${order.customerName}`;
        deleteOrderItem.textContent = `${order.itemCode} · ${order.itemName}`;
        deleteOrderStatus.className = "item-search-status";
        deleteOrderStatus.textContent = "";
        confirmDeleteOrderButton.disabled = false;
        deleteOrderDialog.showModal();
      }

      async function deletePendingOrder() {
        if (!pendingDeleteOrder || isDeletingOrder) {
          return;
        }

        const requestId = pendingDeleteOrder.requestId;
        isDeletingOrder = true;
        confirmDeleteOrderButton.disabled = true;
        cancelDeleteOrderButton.disabled = true;
        closeDeleteOrderButton.disabled = true;
        deleteOrderStatus.className = "item-search-status";
        deleteOrderStatus.textContent = "요청 ID로 견적을 삭제하고 있습니다.";

        try {
          const response = await fetch(`/api/orders/${encodeURIComponent(requestId)}`, {
            method: "DELETE",
            headers: { Accept: "application/json" },
          });
          const result = await response.json();
          if (!response.ok) {
            throw new Error(result.error || `서버 응답 오류 (${response.status})`);
          }
          if (!result.deleted || !result.order || result.order.requestId !== requestId) {
            throw new Error("삭제 응답의 요청 ID가 일치하지 않습니다.");
          }

          pendingDeleteOrder = null;
          deleteOrderDialog.close();
          const listLoaded = await loadOrders();
          if (!listLoaded) {
            setOrderMessage("삭제는 완료됐지만 목록 재조회에 실패했습니다.", true);
            return;
          }
          if (savedOrders.some((order) => order.requestId === requestId)) {
            setOrderMessage("삭제 응답 후에도 목록에 요청 ID가 남아 있습니다.", true);
            return;
          }
          setOrderMessage(`요청 ID ${requestId} 견적을 삭제하고 목록을 갱신했습니다.`);
        } catch (error) {
          deleteOrderStatus.className = "item-search-status error";
          deleteOrderStatus.textContent = `삭제 실패: ${error.message}`;
        } finally {
          isDeletingOrder = false;
          confirmDeleteOrderButton.disabled = false;
          cancelDeleteOrderButton.disabled = false;
          closeDeleteOrderButton.disabled = false;
        }
      }

      function setOrderFormBusy(busy) {
        isSavingOrder = busy;
        saveOrderButton.disabled = busy;
        openCustomerDialogButton.disabled = busy;
        openItemDialogButton.disabled = busy;
        materialSelect.disabled = busy || loadState !== "ready";
        volumeInput.disabled = busy;
        quantityInput.disabled = busy;
      }

      async function saveOrder() {
        if (isSavingOrder) {
          return;
        }

        recalculateWeights();
        const missing = [];
        if (!selectedCustomer) {
          missing.push("거래처");
        }
        if (!selectedItem) {
          missing.push("품목");
        }
        if (!materialSelect.value || selectedMaterialCode !== materialSelect.value) {
          missing.push("활성 재질");
        }
        if (volumeError.textContent || quantityError.textContent) {
          missing.push("유효한 부피와 수량");
        }
        if (missing.length > 0) {
          saveDraft();
          setOrderMessage(`${missing.join(", ")} 정보를 확인해 주세요.`, true);
          return;
        }
        if (!saveDraft()) {
          return;
        }

        const requestId = currentRequestId;
        const payload = {
          requestId,
          customerCode: selectedCustomer.customerCode,
          itemCode: selectedItem.itemCode,
          materialCode: materialSelect.value,
          volumeCm3: volumeInput.valueAsNumber,
          quantity: quantityInput.valueAsNumber,
        };
        setOrderFormBusy(true);
        setOrderMessage("서버에서 최신 기준정보를 확인하고 견적을 저장하고 있습니다.");

        try {
          const response = await fetch("/api/orders", {
            method: "POST",
            headers: {
              Accept: "application/json",
              "Content-Type": "application/json",
            },
            body: JSON.stringify(payload),
          });
          const result = await response.json();
          if (!response.ok) {
            throw new Error(result.error || `서버 응답 오류 (${response.status})`);
          }
          if (!result.order || result.order.requestId !== requestId) {
            throw new Error("저장 응답의 요청 ID가 일치하지 않습니다.");
          }

          const listLoaded = await loadOrders();
          if (!listLoaded) {
            setOrderMessage(
              "저장 요청은 처리되었지만 목록 재조회에 실패했습니다. 같은 요청 ID로 다시 시도할 수 있습니다.",
              true,
            );
            return;
          }
          if (!savedOrders.some((order) => order.requestId === requestId)) {
            setOrderMessage("저장 응답은 받았지만 목록에서 요청 ID를 찾지 못했습니다.", true);
            return;
          }
          setOrderMessage(
            result.duplicate
              ? "이미 저장된 요청을 확인했습니다. 중복 행은 추가되지 않았습니다."
              : "저장 완료. 서버 목록을 다시 읽어 반영했습니다.",
          );
        } catch (error) {
          setOrderMessage(`저장 실패: ${error.message} 입력값과 요청 ID는 유지됩니다.`, true);
        } finally {
          setOrderFormBusy(false);
        }
      }

      function renderItemResults(items) {
        itemResultsBody.replaceChildren();
        if (items.length === 0) {
          const row = document.createElement("tr");
          const cell = document.createElement("td");
          cell.colSpan = 4;
          cell.className = "state";
          cell.textContent = itemSearch.value.trim()
            ? "검색 결과가 없습니다."
            : "조회 가능한 품목이 없습니다.";
          row.append(cell);
          itemResultsBody.append(row);
          itemSearchStatus.className = "item-search-status empty";
          itemSearchStatus.textContent = "품목 목록 0건";
          return;
        }

        for (const item of items) {
          const row = document.createElement("tr");
          const code = document.createElement("td");
          const name = document.createElement("td");
          const spec = document.createElement("td");
          const action = document.createElement("td");
          const selectButton = document.createElement("button");

          code.className = "code";
          code.textContent = item.itemCode;
          name.className = "material-name";
          name.textContent = item.itemName;
          spec.textContent = item.spec;
          selectButton.className = "item-select-button";
          selectButton.type = "button";
          selectButton.textContent = "선택";
          selectButton.addEventListener("click", () => {
            selectedItem = item;
            selectedItemName.textContent = item.itemName;
            selectedItemDetails.textContent = `${item.itemCode} · ${item.spec}`;
            saveDraft();
            itemDialog.close();
          });
          action.append(selectButton);
          row.append(code, name, spec, action);
          itemResultsBody.append(row);
        }

        itemSearchStatus.className = "item-search-status";
        itemSearchStatus.textContent = `검색 결과 ${items.length}건`;
      }

      async function searchItems(query) {
        const requestSequence = ++itemSearchSequence;
        itemSearchStatus.className = "item-search-status";
        itemSearchStatus.textContent = "품목을 조회하고 있습니다.";
        itemResultsBody.replaceChildren();
        const loadingRow = document.createElement("tr");
        const loadingCell = document.createElement("td");
        loadingCell.colSpan = 4;
        loadingCell.className = "state";
        loadingCell.textContent = "검색 중...";
        loadingRow.append(loadingCell);
        itemResultsBody.append(loadingRow);

        try {
          const response = await fetch(`/api/items?q=${encodeURIComponent(query)}`, {
            headers: { Accept: "application/json" },
          });
          if (!response.ok) {
            throw new Error(`서버 응답 오류 (${response.status})`);
          }
          const data = await response.json();
          if (!Array.isArray(data.items)) {
            throw new Error("품목 검색 응답 형식이 올바르지 않습니다.");
          }
          if (requestSequence !== itemSearchSequence || !itemDialog.open) {
            return;
          }
          renderItemResults(data.items);
        } catch (error) {
          if (requestSequence !== itemSearchSequence || !itemDialog.open) {
            return;
          }
          itemResultsBody.replaceChildren();
          const row = document.createElement("tr");
          const cell = document.createElement("td");
          cell.colSpan = 4;
          cell.className = "state error";
          cell.textContent = "품목 조회에 실패했습니다. 검색을 다시 시도해 주세요.";
          row.append(cell);
          itemResultsBody.append(row);
          itemSearchStatus.className = "item-search-status error";
          itemSearchStatus.textContent = `조회 실패: ${error.message}`;
        }
      }

      function openItemDialog() {
        itemSearch.value = "";
        itemDialog.showModal();
        searchItems("");
        itemSearch.focus();
      }

      function renderCustomerResults(customers) {
        customerResultsBody.replaceChildren();
        if (customers.length === 0) {
          const row = document.createElement("tr");
          const cell = document.createElement("td");
          cell.colSpan = 4;
          cell.className = "state";
          cell.textContent = customerSearch.value.trim()
            ? "검색 결과가 없습니다."
            : "조회 가능한 거래처가 없습니다.";
          row.append(cell);
          customerResultsBody.append(row);
          customerSearchStatus.className = "item-search-status empty";
          customerSearchStatus.textContent = "거래처 목록 0건";
          return;
        }

        for (const customer of customers) {
          const row = document.createElement("tr");
          const code = document.createElement("td");
          const name = document.createElement("td");
          const contact = document.createElement("td");
          const action = document.createElement("td");
          const selectButton = document.createElement("button");

          code.className = "code";
          code.textContent = customer.customerCode;
          name.className = "material-name";
          name.textContent = customer.customerName;
          contact.textContent = customer.contactPerson;
          selectButton.className = "item-select-button";
          selectButton.type = "button";
          selectButton.textContent = "선택";
          selectButton.addEventListener("click", () => {
            selectedCustomer = customer;
            selectedCustomerName.textContent = customer.customerName;
            selectedCustomerDetails.textContent =
              `${customer.customerCode} · 담당자 ${customer.contactPerson}`;
            saveDraft();
            customerDialog.close();
          });
          action.append(selectButton);
          row.append(code, name, contact, action);
          customerResultsBody.append(row);
        }

        customerSearchStatus.className = "item-search-status";
        customerSearchStatus.textContent = `검색 결과 ${customers.length}건`;
      }

      async function searchCustomers(query) {
        const requestSequence = ++customerSearchSequence;
        customerSearchStatus.className = "item-search-status";
        customerSearchStatus.textContent = "거래처를 조회하고 있습니다.";
        customerResultsBody.replaceChildren();
        const loadingRow = document.createElement("tr");
        const loadingCell = document.createElement("td");
        loadingCell.colSpan = 4;
        loadingCell.className = "state";
        loadingCell.textContent = "검색 중...";
        loadingRow.append(loadingCell);
        customerResultsBody.append(loadingRow);

        try {
          const response = await fetch(`/api/customers?q=${encodeURIComponent(query)}`, {
            headers: { Accept: "application/json" },
          });
          if (!response.ok) {
            throw new Error(`서버 응답 오류 (${response.status})`);
          }
          const data = await response.json();
          if (!Array.isArray(data.customers)) {
            throw new Error("거래처 검색 응답 형식이 올바르지 않습니다.");
          }
          if (requestSequence !== customerSearchSequence || !customerDialog.open) {
            return;
          }
          renderCustomerResults(data.customers);
        } catch (error) {
          if (requestSequence !== customerSearchSequence || !customerDialog.open) {
            return;
          }
          customerResultsBody.replaceChildren();
          const row = document.createElement("tr");
          const cell = document.createElement("td");
          cell.colSpan = 4;
          cell.className = "state error";
          cell.textContent = "거래처 조회에 실패했습니다. 다시 검색해 주세요.";
          row.append(cell);
          customerResultsBody.append(row);
          customerSearchStatus.className = "item-search-status error";
          customerSearchStatus.textContent = `조회 실패: ${error.message}`;
        }
      }

      function openCustomerDialog() {
        customerSearch.value = "";
        customerDialog.showModal();
        searchCustomers("");
        customerSearch.focus();
      }

      function renderLoadMessage() {
        if (loadState === "error") {
          selectionMessage.className = "notice error";
          selectionMessage.textContent =
            "조회 실패: 재질 목록을 불러오지 못했습니다. 서버 연결을 확인한 뒤 다시 시도해 주세요.";
          status.textContent = "재질 목록 조회에 실패했습니다.";
        } else if (loadState === "empty") {
          selectionMessage.className = "notice empty";
          selectionMessage.textContent =
            "조회 결과가 0건입니다. 활성 재질 기준정보를 확인해 주세요.";
          status.textContent = "재질 목록이 비어 있습니다.";
        } else if (loadState === "loading") {
          selectionMessage.className = "notice";
          selectionMessage.textContent = "재질 목록을 조회하고 있습니다.";
          status.textContent = "기준정보 파일에서 최신 목록을 불러옵니다.";
        } else {
          selectionMessage.className = "notice";
          selectionMessage.textContent = "선택한 재질의 계산용 밀도를 표시합니다.";
        }
      }

      function render() {
        renderLoadMessage();
        const query = search.value.trim().toLocaleLowerCase("ko-KR");
        const filtered = materials.filter((material) =>
          `${material.materialCode} ${material.materialName}`.toLocaleLowerCase("ko-KR").includes(query),
        );

        count.textContent =
          loadState === "error" ? "!" : loadState === "loading" ? "—" : String(materials.length);
        body.replaceChildren();

        if (loadState !== "ready") {
          const row = document.createElement("tr");
          const cell = document.createElement("td");
          cell.colSpan = 3;
          cell.className = loadState === "error" ? "state error" : "state";
          cell.textContent =
            loadState === "error"
              ? "재질 조회에 실패했습니다. 새로고침으로 다시 시도해 주세요."
              : loadState === "empty"
                ? "조회된 재질이 없습니다."
                : "재질 목록을 불러오는 중입니다.";
          row.append(cell);
          body.append(row);
          return;
        }

        if (filtered.length === 0) {
          const row = document.createElement("tr");
          const cell = document.createElement("td");
          cell.colSpan = 3;
          cell.className = "state";
          cell.textContent = materials.length ? "검색 결과가 없습니다." : "표시할 활성 재질이 없습니다.";
          row.append(cell);
          body.append(row);
          status.textContent = `검색 결과 ${filtered.length}건`;
          return;
        }

        for (const material of filtered) {
          const row = document.createElement("tr");
          const code = document.createElement("td");
          const name = document.createElement("td");
          const density = document.createElement("td");
          const unit = document.createElement("span");

          code.className = "code";
          code.textContent = material.materialCode;
          name.className = "material-name";
          name.textContent = material.materialName;
          density.className = "density";
          density.textContent = new Intl.NumberFormat("ko-KR", {
            maximumFractionDigits: 4,
          }).format(material.calculationDensityGPerCm3);
          unit.className = "density-unit";
          unit.textContent = "g/cm³";
          density.append(unit);
          row.append(code, name, density);
          body.append(row);
        }

        status.textContent = `검색 결과 ${filtered.length}건 · 사용여부 Y`;
      }

      async function loadMaterials() {
        const selectedCode = materialSelect.value;
        refresh.disabled = true;
        loadState = "loading";
        renderDropdown();
        render();
        recalculateWeights();
        try {
          const response = await fetch("/api/materials", {
            headers: { Accept: "application/json" },
          });
          if (!response.ok) {
            throw new Error(`서버 응답 오류 (${response.status})`);
          }
          const data = await response.json();
          if (!Array.isArray(data.materials)) {
            throw new Error("재질 목록 응답 형식이 올바르지 않습니다.");
          }
          materials = data.materials;
          loadState = materials.length === 0 ? "empty" : "ready";
          renderDropdown(selectedCode);
          render();
          recalculateWeights();
        } catch (error) {
          materials = [];
          loadState = "error";
          renderDropdown();
          render();
          recalculateWeights();
          selectionMessage.title = error.message;
        } finally {
          refresh.disabled = false;
        }
      }

      search.addEventListener("input", render);
      materialSelect.addEventListener("change", () => {
        selectedMaterialCode = materialSelect.value;
        updateSelectedDensity();
        recalculateWeights();
        saveDraft();
      });
      volumeInput.addEventListener("input", () => {
        recalculateWeights();
        saveDraft();
      });
      quantityInput.addEventListener("input", () => {
        recalculateWeights();
        saveDraft();
      });
      saveOrderButton.addEventListener("click", saveOrder);
      openItemDialogButton.addEventListener("click", openItemDialog);
      closeItemDialogButton.addEventListener("click", () => itemDialog.close());
      cancelItemSelectionButton.addEventListener("click", () => itemDialog.close());
      itemSearch.addEventListener("input", () => {
        clearTimeout(itemSearchTimer);
        itemSearchTimer = setTimeout(
          () => searchItems(itemSearch.value.trim()),
          180,
        );
      });
      itemDialog.addEventListener("close", () => {
        clearTimeout(itemSearchTimer);
        itemSearchSequence += 1;
      });
      itemDialog.addEventListener("click", (event) => {
        if (event.target === itemDialog) {
          itemDialog.close();
        }
      });
      openCustomerDialogButton.addEventListener("click", openCustomerDialog);
      closeCustomerDialogButton.addEventListener("click", () => customerDialog.close());
      cancelCustomerSelectionButton.addEventListener("click", () => customerDialog.close());
      customerSearch.addEventListener("input", () => {
        clearTimeout(customerSearchTimer);
        customerSearchTimer = setTimeout(
          () => searchCustomers(customerSearch.value.trim()),
          180,
        );
      });
      customerDialog.addEventListener("close", () => {
        clearTimeout(customerSearchTimer);
        customerSearchSequence += 1;
      });
      customerDialog.addEventListener("click", (event) => {
        if (event.target === customerDialog) {
          customerDialog.close();
        }
      });
      confirmDeleteOrderButton.addEventListener("click", deletePendingOrder);
      cancelDeleteOrderButton.addEventListener("click", () => deleteOrderDialog.close());
      closeDeleteOrderButton.addEventListener("click", () => deleteOrderDialog.close());
      deleteOrderDialog.addEventListener("close", () => {
        if (!isDeletingOrder) {
          pendingDeleteOrder = null;
        }
      });
      deleteOrderDialog.addEventListener("click", (event) => {
        if (event.target === deleteOrderDialog) {
          deleteOrderDialog.close();
        }
      });
      createMailPreviewButton.addEventListener("click", createMailPreview);
      sendMailButton.addEventListener("click", sendMail);
      cancelMailPreviewButton.addEventListener("click", () => mailPreviewDialog.close());
      closeMailPreviewButton.addEventListener("click", () => mailPreviewDialog.close());
      mailPreviewDialog.addEventListener("close", () => {
        if (!isCreatingMailPreview && !isSendingMail) {
          pendingMailOrder = null;
          mailPreviewSequence += 1;
        }
      });
      mailPreviewDialog.addEventListener("click", (event) => {
        if (event.target === mailPreviewDialog && !isCreatingMailPreview && !isSendingMail) {
          mailPreviewDialog.close();
        }
      });
      mailPreviewDialog.addEventListener("cancel", (event) => {
        if (isCreatingMailPreview || isSendingMail) {
          event.preventDefault();
        }
      });
      refresh.addEventListener("click", loadMaterials);

      async function initializePage() {
        const draft = readSavedDraft();
        await loadMaterials();
        restoreDraft(draft);
        await loadOrders();
      }

      initializePage();
