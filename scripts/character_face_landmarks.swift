import Foundation
import Vision
import ImageIO
var results: [[String: Any]] = []
for path in CommandLine.arguments.dropFirst() {
 let url = URL(fileURLWithPath:path)
 let source = CGImageSourceCreateWithURL(url as CFURL,nil)!
 let image = CGImageSourceCreateImageAtIndex(source,0,nil)!
 let width = Int(Double(image.width) * (path.contains("wheelchair") ? 0.23 : path.contains("cyclist") ? 0.277 : 0.30))
 let crop = image.cropping(to:CGRect(x:0,y:0,width:width,height:image.height))!
 let request = VNDetectFaceLandmarksRequest()
 try VNImageRequestHandler(cgImage:crop).perform([request])
 guard let face=request.results?.max(by:{$0.boundingBox.height < $1.boundingBox.height}), let landmarks=face.landmarks else {fatalError(path)}
 let box=face.boundingBox
 func points(_ region: VNFaceLandmarkRegion2D?) -> [[Double]] {
  return region?.normalizedPoints.map { p in [Double(box.origin.x + CGFloat(p.x)*box.width)*Double(width), (1-Double(box.origin.y+CGFloat(p.y)*box.height))*Double(image.height)] } ?? []
 }
 results.append(["file":url.lastPathComponent,"leftEye":points(landmarks.leftEye),"rightEye":points(landmarks.rightEye),"nose":points(landmarks.nose),"lips":points(landmarks.outerLips),"contour":points(landmarks.faceContour),"brows":points(landmarks.leftEyebrow)+points(landmarks.rightEyebrow)])
}
let data=try JSONSerialization.data(withJSONObject:results,options:[.prettyPrinted,.sortedKeys])
print(String(data:data,encoding:.utf8)!)
