import SwiftUI
#if canImport(MAMapKit) && canImport(AMapFoundationKit)
import MAMapKit
import AMapFoundationKit
#endif

/// Only renders after the traveller explicitly chooses to load AMap. No device
/// location is requested, and an observed point is never promoted to an entrance.
struct NativePlaceMapCanvas: View {
    let point: NativePlaceCoordinate
    let selectionID: String
    let name: String
    let onSelect: (String) -> Void
    @Environment(AppSettings.self) private var settings

    var body: some View {
        #if canImport(MAMapKit) && canImport(AMapFoundationKit)
        if let key = Bundle.main.object(forInfoDictionaryKey: "VisePandaAMapIOSKey") as? String,
           !key.isEmpty, !key.hasPrefix("$("), point.coordinateSystem == "gcj02",
           point.lat.isFinite, point.lng.isFinite,
           (-90...90).contains(point.lat), (-180...180).contains(point.lng) {
            AMapNativeView(point: point, selectionID: selectionID, name: name, key: key, onSelect: onSelect)
        } else { unavailable }
        #else
        unavailable
        #endif
    }

    private var unavailable: some View {
        Text(settings.selectedLocale == .zh ? "地图暂不可用，仍可使用地点地址。" : "Map unavailable. You can still use the place address.")
            .font(.callout).foregroundStyle(Color.vpSecondaryText)
            .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
}

#if canImport(MAMapKit) && canImport(AMapFoundationKit)
private struct AMapNativeView: UIViewRepresentable {
    let point: NativePlaceCoordinate
    let selectionID: String
    let name: String
    let key: String
    let onSelect: (String) -> Void

    func makeCoordinator() -> Coordinator { Coordinator() }
    func makeUIView(context: Context) -> MAMapView {
        // The enclosing UI presents the data recipient/use notice before mounting.
        MAMapView.updatePrivacyShow(.didShow, privacyInfo: .didContain)
        MAMapView.updatePrivacyAgree(.didAgree)
        AMapServices.shared().apiKey = key
        let map = MAMapView(frame: .zero)
        map.showsUserLocation = false
        map.delegate = context.coordinator
        map.zoomLevel = 16
        return map
    }
    func updateUIView(_ map: MAMapView, context: Context) {
        context.coordinator.selectionID = selectionID
        context.coordinator.onSelect = onSelect
        let coordinate = CLLocationCoordinate2D(latitude: point.lat, longitude: point.lng)
        if context.coordinator.lastPoint != point || context.coordinator.lastID != selectionID {
            map.removeAnnotations(map.annotations)
            let annotation = MAPointAnnotation()
            annotation.coordinate = coordinate
            annotation.title = name
            map.addAnnotation(annotation)
            map.setCenter(coordinate, animated: false)
            context.coordinator.lastPoint = point
            context.coordinator.lastID = selectionID
        }
    }
    static func dismantleUIView(_ map: MAMapView, coordinator: Coordinator) {
        map.showsUserLocation = false
        map.delegate = nil
        map.removeAnnotations(map.annotations)
    }
    final class Coordinator: NSObject, MAMapViewDelegate {
        var selectionID = ""
        var onSelect: ((String) -> Void)?
        var lastPoint: NativePlaceCoordinate?
        var lastID: String?
        func mapView(_ mapView: MAMapView!, didSelect view: MAAnnotationView!) { onSelect?(selectionID) }
    }
}
#endif
