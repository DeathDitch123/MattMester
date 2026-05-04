function getProfileImageEditorElements() {
    return {
        uploadInput: document.getElementById('avatarUpload'),
        modal: document.getElementById('profileImageEditorModal'),
        canvas: document.getElementById('profileImageEditorCanvas'),
        previewCanvas: document.getElementById('profileImageEditorPreview'),
        zoomInput: document.getElementById('profileImageZoom'),
        rotateInput: document.getElementById('profileImageRotate'),
        resetButton: document.getElementById('resetProfileImageEditor'),
        saveButton: document.getElementById('saveProfileImageButton'),
        message: document.getElementById('profileImageEditorMessage')
    };
}

function setProfileImageEditorMessage(type, message) {
    const { message: messageElement } = getProfileImageEditorElements();
    if (messageElement) {
        if (!message) {
            messageElement.className = 'alert d-none mt-3 mb-0';
            messageElement.textContent = '';
        } else {
            messageElement.className = `alert alert-${type} mt-3 mb-0`;
            messageElement.textContent = message;
        }
    }
}

function resetProfileImageEditorState() {
    const elements = getProfileImageEditorElements();
    profileImageEditorState.scale = 1;
    profileImageEditorState.rotationDeg = 0;
    profileImageEditorState.offsetX = 0;
    profileImageEditorState.offsetY = 0;
    profileImageEditorState.dragging = false;
    profileImageEditorState.lastPointerX = 0;
    profileImageEditorState.lastPointerY = 0;
    profileImageEditorState.uploading = false;

    if (elements.zoomInput) {
        elements.zoomInput.value = '1';
    }

    if (elements.rotateInput) {
        elements.rotateInput.value = '0';
    }

    if (elements.saveButton) {
        elements.saveButton.disabled = !profileImageEditorState.image;
        elements.saveButton.textContent = 'Mentés';
    }

    setProfileImageEditorMessage('danger', '');
}

function revokeProfileImageObjectUrl() {
    if (profileImageEditorState.objectUrl) {
        URL.revokeObjectURL(profileImageEditorState.objectUrl);
        profileImageEditorState.objectUrl = null;
    }
}

function clearProfileImageEditorImage() {
    profileImageEditorState.image = null;
    revokeProfileImageObjectUrl();
    resetProfileImageEditorState();
    renderProfileImageEditor();
}

function getEditorCropRadius(canvas) {
    return Math.min(canvas.width, canvas.height) * 0.32;
}

function drawTransformedImage(ctx, image, canvasWidth, canvasHeight) {
    ctx.save();
    ctx.translate(canvasWidth / 2 + profileImageEditorState.offsetX, canvasHeight / 2 + profileImageEditorState.offsetY);
    ctx.rotate((profileImageEditorState.rotationDeg * Math.PI) / 180);
    ctx.scale(profileImageEditorState.scale, profileImageEditorState.scale);
    ctx.drawImage(image, -image.width / 2, -image.height / 2);
    ctx.restore();
}

function renderProfileImageEditor() {
    const elements = getProfileImageEditorElements();
    if (!elements.canvas || !elements.previewCanvas) {
        return;
    }

    const canvas = elements.canvas;
    const previewCanvas = elements.previewCanvas;
    const rect = canvas.getBoundingClientRect();
    const nextWidth = Math.max(320, Math.round(rect.width || 640));
    const nextHeight = Math.max(260, Math.round(rect.height || 340));

    if (canvas.width !== nextWidth || canvas.height !== nextHeight) {
        canvas.width = nextWidth;
        canvas.height = nextHeight;
    }

    const ctx = canvas.getContext('2d');
    if (!ctx) {
        return;
    }

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#020617';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const image = profileImageEditorState.image;
    if (!image) {
        ctx.fillStyle = 'rgba(148, 163, 184, 0.8)';
        ctx.font = '15px Inter, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('Válassz egy képet a szerkesztéshez.', canvas.width / 2, canvas.height / 2);
        return;
    }

    const cropRadius = getEditorCropRadius(canvas);
    drawTransformedImage(ctx, image, canvas.width, canvas.height);

    ctx.save();
    ctx.fillStyle = 'rgba(2, 6, 23, 0.58)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.globalCompositeOperation = 'destination-out';
    ctx.beginPath();
    ctx.arc(canvas.width / 2, canvas.height / 2, cropRadius, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    ctx.save();
    ctx.strokeStyle = 'rgba(212, 175, 55, 0.9)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(canvas.width / 2, canvas.height / 2, cropRadius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();

    const bufferCanvas = profileImageEditorState.bufferCanvas;
    bufferCanvas.width = canvas.width;
    bufferCanvas.height = canvas.height;
    const bufferCtx = bufferCanvas.getContext('2d');
    if (!bufferCtx) {
        return;
    }
    bufferCtx.clearRect(0, 0, bufferCanvas.width, bufferCanvas.height);
    drawTransformedImage(bufferCtx, image, bufferCanvas.width, bufferCanvas.height);

    const previewCtx = previewCanvas.getContext('2d');
    if (!previewCtx) {
        return;
    }

    previewCtx.clearRect(0, 0, previewCanvas.width, previewCanvas.height);
    previewCtx.save();
    previewCtx.beginPath();
    previewCtx.arc(previewCanvas.width / 2, previewCanvas.height / 2, previewCanvas.width / 2, 0, Math.PI * 2);
    previewCtx.clip();
    previewCtx.drawImage(
        bufferCanvas,
        canvas.width / 2 - cropRadius,
        canvas.height / 2 - cropRadius,
        cropRadius * 2,
        cropRadius * 2,
        0,
        0,
        previewCanvas.width,
        previewCanvas.height
    );
    previewCtx.restore();
}

function bindProfileImageEditorCanvasEvents() {
    const { canvas } = getProfileImageEditorElements();
    if (!canvas) {
        return;
    }

    canvas.addEventListener('pointerdown', (event) => {
        if (!profileImageEditorState.image || profileImageEditorState.uploading) {
            return;
        }

        profileImageEditorState.dragging = true;
        profileImageEditorState.lastPointerX = event.clientX;
        profileImageEditorState.lastPointerY = event.clientY;
        canvas.setPointerCapture(event.pointerId);
    });

    canvas.addEventListener('pointermove', (event) => {
        if (!profileImageEditorState.dragging || !profileImageEditorState.image || profileImageEditorState.uploading) {
            return;
        }

        const deltaX = event.clientX - profileImageEditorState.lastPointerX;
        const deltaY = event.clientY - profileImageEditorState.lastPointerY;

        profileImageEditorState.lastPointerX = event.clientX;
        profileImageEditorState.lastPointerY = event.clientY;
        profileImageEditorState.offsetX += deltaX;
        profileImageEditorState.offsetY += deltaY;
        renderProfileImageEditor();
    });

    const stopDragging = (event) => {
        if (profileImageEditorState.dragging) {
            profileImageEditorState.dragging = false;
            if (typeof event.pointerId === 'number') {
                canvas.releasePointerCapture(event.pointerId);
            }
        }
    };

    canvas.addEventListener('pointerup', stopDragging);
    canvas.addEventListener('pointercancel', stopDragging);
    canvas.addEventListener('pointerleave', stopDragging);
}

function validateProfileImageFile(file) {
    if (!file) {
        return 'A kép kiválasztása kötelező.';
    }

    if (!PROFILE_IMAGE_ALLOWED_MIME_TYPES.has(file.type)) {
        return 'Nem támogatott képformátum. Csak JPG, PNG és WEBP engedélyezett.';
    }

    if (file.size > PROFILE_IMAGE_MAX_SIZE_BYTES) {
        return 'A kép mérete legfeljebb 3 MB lehet.';
    }

    return '';
}

async function openProfileImageEditorFromFile(file) {
    const elements = getProfileImageEditorElements();
    if (!elements.modal) {
        return;
    }

    revokeProfileImageObjectUrl();
    profileImageEditorState.objectUrl = URL.createObjectURL(file);

    const image = new Image();
    image.src = profileImageEditorState.objectUrl;

    await new Promise((resolve, reject) => {
        image.onload = () => resolve();
        image.onerror = () => reject(new Error('A kép betöltése sikertelen.'));
    });

    profileImageEditorState.image = image;
    resetProfileImageEditorState();

    const modal = bootstrap.Modal.getOrCreateInstance(elements.modal);
    modal.show();
    setTimeout(() => renderProfileImageEditor(), 0);
}

function getCroppedProfileImageBlob() {
    const { canvas } = getProfileImageEditorElements();
    const image = profileImageEditorState.image;
    if (!canvas || !image) {
        return Promise.reject(new Error('Nincs szerkesztésre kiválasztott kép.'));
    }

    const cropRadius = getEditorCropRadius(canvas);
    const outputCanvas = document.createElement('canvas');
    outputCanvas.width = 512;
    outputCanvas.height = 512;
    const outputCtx = outputCanvas.getContext('2d');
    if (!outputCtx) {
        return Promise.reject(new Error('Nem sikerült előkészíteni a kép mentését.'));
    }

    outputCtx.drawImage(
        profileImageEditorState.bufferCanvas,
        canvas.width / 2 - cropRadius,
        canvas.height / 2 - cropRadius,
        cropRadius * 2,
        cropRadius * 2,
        0,
        0,
        outputCanvas.width,
        outputCanvas.height
    );

    return new Promise((resolve, reject) => {
        outputCanvas.toBlob((blob) => {
            if (!blob) {
                reject(new Error('A kép mentése sikertelen.'));
                return;
            }

            resolve(blob);
        }, 'image/png');
    });
}

async function submitProfileImageUpload() {
    const elements = getProfileImageEditorElements();
    if (!elements.saveButton || profileImageEditorState.uploading) {
        return;
    }

    if (!profileImageEditorState.image) {
        setProfileImageEditorMessage('danger', 'Nincs szerkesztésre kiválasztott kép.');
        return;
    }

    profileImageEditorState.uploading = true;
    elements.saveButton.disabled = true;
    elements.saveButton.textContent = 'Feltöltés...';
    setProfileImageEditorMessage('danger', '');

    try {
        const imageBlob = await getCroppedProfileImageBlob();
        const formData = new FormData();
        formData.append('image', imageBlob, 'profile-image.png');

        const response = await fetch('/api/profile/upload-image', {
            method: 'POST',
            body: formData
        });

        const result = await parseJson(response);
        if (!response.ok || !result.success) {
            handleEmailNotVerifiedCta(result);
            throw new Error(result.message || 'A képfeltöltés nem sikerült.');
        }

        setProfileSettingsMessage('success', result.message || 'A profilkép feltöltve, függő státuszba került.');

        if (elements.modal) {
            const modal = bootstrap.Modal.getOrCreateInstance(elements.modal);
            modal.hide();
        }

        if (elements.uploadInput) {
            elements.uploadInput.value = '';
        }

        await syncSocketContextOrReconnect('profile-image-upload');
        await refreshAuthUi('profile-image-upload-success');
    } catch (error) {
        setProfileImageEditorMessage('danger', error.message || 'Hiba történt a képfeltöltés közben.');
        throw new Error(error.message || 'Profilkép feltöltési hiba.');
    } finally {
        profileImageEditorState.uploading = false;
        if (elements.saveButton) {
            elements.saveButton.disabled = !profileImageEditorState.image;
            elements.saveButton.textContent = 'Mentés';
        }
    }
}

function bindProfileImageUploadEvents() {
    try {
        const elements = getProfileImageEditorElements();
        if (!elements.uploadInput || !elements.modal) {
            throw new Error('Hianyzik a profile image upload input vagy modal.');
        }

        if (profileImageEditorState.bound) {
            throw new Error('A profile image upload esemenyek mar be vannak kotve.');
        }

        profileImageEditorState.bound = true;

        elements.uploadInput.addEventListener('change', async (event) => {
            await runSafelyAsync('profileImageUploadChange', async () => {
                try {
                    const file = event.target.files?.[0] || null;
                    const fileError = validateProfileImageFile(file);

                    if (fileError) {
                        throw new Error(fileError);
                    }

                    await openProfileImageEditorFromFile(file);
                } catch (error) {
                    setProfileSettingsMessage('danger', error.message || 'A kiválasztott kép nem nyitható meg.');
                    elements.uploadInput.value = '';
                    throw error;
                }
            });
        });

        if (elements.zoomInput) {
            elements.zoomInput.addEventListener('input', () => {
                runSafely('profileImageZoomInput', () => {
                    profileImageEditorState.scale = Number(elements.zoomInput.value) || 1;
                    renderProfileImageEditor();
                });
            });
        }

        if (elements.rotateInput) {
            elements.rotateInput.addEventListener('input', () => {
                runSafely('profileImageRotateInput', () => {
                    profileImageEditorState.rotationDeg = Number(elements.rotateInput.value) || 0;
                    renderProfileImageEditor();
                });
            });
        }

        if (elements.resetButton) {
            elements.resetButton.addEventListener('click', () => {
                runSafely('profileImageResetClick', () => {
                    resetProfileImageEditorState();
                    renderProfileImageEditor();
                });
            });
        }

        if (elements.saveButton) {
            elements.saveButton.addEventListener('click', async () => {
                await runSafelyAsync('profileImageSaveClick', async () => {
                    await submitProfileImageUpload();
                });
            });
        }

        bindProfileImageEditorCanvasEvents();

        elements.modal.addEventListener('shown.bs.modal', () => {
            runSafely('profileImageModalShown', () => {
                renderProfileImageEditor();
            });
        });

        elements.modal.addEventListener('hidden.bs.modal', () => {
            runSafely('profileImageModalHidden', () => {
                clearProfileImageEditorImage();
                if (elements.uploadInput) {
                    elements.uploadInput.value = '';
                }
            });
        });

        window.addEventListener('resize', () => {
            runSafely('profileImageWindowResize', () => {
                if (profileImageEditorState.image) {
                    renderProfileImageEditor();
                }
            });
        });
    } catch (error) {
        console.error('bindProfileImageUploadEvents hiba:', error);
    }
}

