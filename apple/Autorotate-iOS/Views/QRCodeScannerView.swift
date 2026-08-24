//
//  QRCodeScannerView.swift
//  TopSpin-iOS
//
//  AVFoundation-based QR code camera scanner for instant Web-to-iOS workspace pairing.
//

import SwiftUI
import AVFoundation

struct QRCodeScannerView: View {
    @Environment(\.dismiss) private var dismiss
    @Environment(AppModel.self) private var model

    @State private var scannedCode: String?
    @State private var pairingSuccess = false
    @State private var errorMessage: String?

    var body: some View {
        NavigationStack {
            ZStack {
                CameraPreviewView { code in
                    handleScannedCode(code)
                }
                .ignoresSafeArea()

                // Overlay targeting frame
                VStack {
                    Text("Point camera at the TopSpin Web Control Center Pairing QR code")
                        .font(.subheadline)
                        .multilineTextAlignment(.center)
                        .padding(.horizontal, 24)
                        .padding(.vertical, 12)
                        .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 12))
                        .padding(.top, 24)

                    Spacer()

                    RoundedRectangle(cornerRadius: 24)
                        .strokeBorder(Color.accentColor, lineWidth: 3)
                        .frame(width: 260, height: 260)
                        .background(Color.black.opacity(0.1))

                    Spacer()

                    if pairingSuccess {
                        Label("Workspace Paired Successfully!", systemImage: "checkmark.circle.fill")
                            .font(.headline)
                            .foregroundStyle(.green)
                            .padding()
                            .background(.ultraThinMaterial, in: Capsule())
                            .padding(.bottom, 32)
                    } else if let errorMessage {
                        Text(errorMessage)
                            .font(.caption)
                            .foregroundStyle(.red)
                            .padding()
                            .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 8))
                            .padding(.bottom, 32)
                    }
                }
            }
            .navigationTitle("Scan Pairing QR")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Close") { dismiss() }
                }
            }
        }
    }

    private func handleScannedCode(_ code: String) {
        guard !pairingSuccess else { return }
        guard let data = code.data(using: .utf8),
              let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else {
            errorMessage = "Invalid QR code format."
            return
        }

        if let baseUrl = json["baseUrl"] as? String {
            model.settings.infisicalBaseUrl = baseUrl
        }
        if let env = json["environment"] as? String {
            model.settings.infisicalEnvironment = env
        }

        model.noteSettingsChanged()
        pairingSuccess = true
        UINotificationFeedbackGenerator().notificationOccurred(.success)

        DispatchQueue.main.asyncAfter(deadline: .now() + 1.2) {
            dismiss()
        }
    }
}

// MARK: - UIKit Camera Preview Representable

struct CameraPreviewView: UIViewControllerRepresentable {
    var onCodeFound: (String) -> Void

    func makeUIViewController(context: Context) -> ScannerViewController {
        let vc = ScannerViewController()
        vc.onCodeFound = onCodeFound
        return vc
    }

    func updateUIViewController(_ uiViewController: ScannerViewController, context: Context) {}
}

@MainActor
final class ScannerViewController: UIViewController, @preconcurrency AVCaptureMetadataOutputObjectsDelegate {
    var onCodeFound: ((String) -> Void)?
    private var captureSession: AVCaptureSession?
    private var previewLayer: AVCaptureVideoPreviewLayer?

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .black
        setupCamera()
    }

    override func viewDidLayoutSubviews() {
        super.viewDidLayoutSubviews()
        previewLayer?.frame = view.layer.bounds
    }

    private func setupCamera() {
        let session = AVCaptureSession()
        guard let device = AVCaptureDevice.default(for: .video),
              let input = try? AVCaptureDeviceInput(device: device),
              session.canAddInput(input) else {
            return
        }
        session.addInput(input)

        let output = AVCaptureMetadataOutput()
        guard session.canAddOutput(output) else { return }
        session.addOutput(output)

        output.setMetadataObjectsDelegate(self, queue: DispatchQueue.main)
        output.metadataObjectTypes = [.qr]

        let layer = AVCaptureVideoPreviewLayer(session: session)
        layer.videoGravity = .resizeAspectFill
        layer.frame = view.layer.bounds
        view.layer.addSublayer(layer)

        self.captureSession = session
        self.previewLayer = layer

        nonisolated(unsafe) let capture = session
        DispatchQueue.global(qos: .userInitiated).async {
            capture.startRunning()
        }
    }

    nonisolated func metadataOutput(_ output: AVCaptureMetadataOutput, didOutput metadataObjects: [AVMetadataObject], from connection: AVCaptureConnection) {
        guard let obj = metadataObjects.first as? AVMetadataMachineReadableCodeObject,
              let stringVal = obj.stringValue else { return }
        Task { @MainActor [weak self] in
            self?.onCodeFound?(stringVal)
        }
    }
}

