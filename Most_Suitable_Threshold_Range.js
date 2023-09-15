/* +++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
 * +++++                    Most suitable threshold range                   ++++++
 * +++++   Author: Vu Anh Minh, TH Köln – University of Applied Sciences    ++++++
 * +++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
 */
//////////////// Part 1: Prepare ROI and Reference data
// Draw geometry, or import shapefile with the region of interest 
var ROI =  ee.FeatureCollection(
        [ee.Feature(
            ee.Geometry.Polygon(
                [[[106.71320396716249, 17.17196706526303],
                  [106.71316105181825, 17.170367968517564],
                  [106.71401935870301, 17.169383902127546],
                  [106.71290355975282, 17.168153811796596],
                  [106.71122986132752, 17.168932869953576],
                  [106.71032863909852, 17.16831782431213],
                  [106.7092986708368, 17.166718696098552],
                  [106.70878368670594, 17.164873531027403],
                  [106.709513247558, 17.164094455819736],
                  [106.71092945391786, 17.16429947592846],
                  [106.71170193011415, 17.1654885880906],
                  [106.71281772906434, 17.16655468216884],
                  [106.71431976611268, 17.166513678663758],
                  [106.71560722643983, 17.165898624999684],
                  [106.71629387194764, 17.1649965426032],
                  [106.71470600421083, 17.16319236464949],
                  [106.71384769732606, 17.161511183036403],
                  [106.71474891955506, 17.16065008411538],
                  [106.71612221057069, 17.161142141131034],
                  [106.71762424761903, 17.161757210565508],
                  [106.72011333758485, 17.16188022420771],
                  [106.72067123705995, 17.16298734331721],
                  [106.7211862211908, 17.164504495810586],
                  [106.72243076617372, 17.166062639509526],
                  [106.72423321063172, 17.165898624999684],
                  [106.72573524768006, 17.165570595544924],
                  [106.72697979266297, 17.164094455819736],
                  [106.7283530836786, 17.163602406634304],
                  [106.72813850695741, 17.162208260188194],
                  [106.72903972918641, 17.161839219669382],
                  [106.73049885089051, 17.16241328238145],
                  [106.73101383502137, 17.161019126999456],
                  [106.73234421069276, 17.161101136429565],
                  [106.73320251757752, 17.16196223325721],
                  [106.73303085620057, 17.16368441492252],
                  [106.73277336413514, 17.164750519370042],
                  [106.73260170275819, 17.166226653874336],
                  [106.73277336413514, 17.167579766849958],
                  [106.73191505725038, 17.169301896359336],
                  [106.73109966570985, 17.170408971170488],
                  [106.72938305194032, 17.171803055975108],
                  [106.7283530836786, 17.1727871095265],
                  [106.72766643817079, 17.17344314232583],
                  [106.72650772387635, 17.17356614821725],
                  [106.72449070269715, 17.17360715016293],
                  [106.72298866564881, 17.17356614821725],
                  [106.72182995135438, 17.1727871095265],
                  [106.72045666033875, 17.17184405831069],
                  [106.71921211535584, 17.171270024787432],
                  [106.71835380847108, 17.170572981691507],
                  [106.71676594073426, 17.170326965855573],
                  [106.71573597247254, 17.171024009876312],
                  [106.71504932696473, 17.172418090056777],
                  [106.71406227404725, 17.1727871095265]]]),
            {
              "system:index": "0"
            })]);
Map.addLayer(ROI, {}, 'ROI',false);
Map.centerObject(ROI, 13);

//Import reference data
var NonWater = ee.FeatureCollection("users/MinhVu/Frame30m"),
    Water = ee.FeatureCollection("users/MinhVu/PhuHoa30m_polygon");
var water = ee.FeatureCollection(Water);
var nonwater = ee.FeatureCollection(NonWater);

// Overwrite the old properties with a new dictionary for reference data.
var water = water.set('Landcover', 1);
var nonwater = nonwater.set('Landcover', 0);
Map.addLayer(water, {}, 'ref',false);

//Merge non-water and water to create validation layers
var newfc = nonwater.merge(water);
print(newfc);

//////////////// Part 2: Surface water extraction
// The following code find the most optimal threshold for surface water extraction of a specific date.
// To find the most suitable threshold range, repeat this process for all dates within the study period.
// Note: For different evaluated date, the reference data must be changed coressponding 

//Sentinel 1 image selection based on the desired date. 
var image_sen1 = ee.Image('COPERNICUS/S1_GRD/S1A_IW_GRDH_1SDV_20210126T224338_20210126T224407_036315_0442CB_0BDD').select('VH');
var sen1_smoothed = image_sen1.focal_median(50,'circle','meters').rename('VH_Filtered').clip(ROI); //Apply a focal median filter
var image_sen1 = image_sen1.addBands(sen1_smoothed); // Add filtered VH band to original image
Map.addLayer(image_sen1,{bands: 'VH_Filtered',min: -18, max: 0}, 'Filtered SAR image',0);

// Color param for water mapping
var visParams = {
      min: 0,
      max: 1,
      palette: ['#FFFFFF','#0000FF']
    };


///// Loop function for indice value trials
var minIndice = -25;
var maxIndice = -10;
var step = 1; // Threshold increment
var List = ee.List.sequence({start: minIndice, step: step, end: maxIndice});
var size = List.size();
print(size,'Total value of Indice');
///// Subtitute i < Total value of Indice 
for (var i = 0; i < 16; i++) {
var sen1_param = List.getNumber(i);
var vv = image_sen1.select('VH_Filtered');
var water = vv.lt(sen1_param).rename('water');  //Identify all pixels below threshold and set them equal to 1. All other pixels set to 0
var mask = water.updateMask(water).mask(); //Remove all pixels equal to 0
var image_sen1 = image_sen1.addBands(water);  //Return image with added classified water band

// Set threshold value for labeling
var value = i - 25;
Map.addLayer(mask, visParams,'Water Masked_' + value, false);

//Calculate area of extracted surface water with corresponding thresholds
var water_area = ee.Image.pixelArea().addBands(mask).divide(1e6)
                      .reduceRegion({
                        reducer: ee.Reducer.sum().group(1), 
                        geometry: ROI,
                        scale: 10,
                        bestEffort: true
                      });
print(water_area, 'Water Area in Square KM_'+ value);

//////////////// Part 3: Accuracy assessment of extracted surface water
var validate = mask.sampleRegions({
  collection: newfc,
  properties: ['Landcover'],
  scale: 10,
  tileScale: 4,
  geometries: true
}).randomColumn();
// print(validate);

var OverallAccuracy = validate.errorMatrix('Landcover', 'water');
// Printing of confusion matrix may time out. Alternatively, you can export it as CSV
print('Overall Accuracy_' + value, OverallAccuracy.accuracy());
var Kappa = OverallAccuracy.kappa();
print('Kappa_'+ value, Kappa);
}

// Show boundary of water reference data to visually compare with extracted water
var shown = 0; // true or false, 1 or 0 
var opacity = 0.2; // number [0-1]
var nameLayer = 'Phu Hoa boundary'; // string
var visParams = {color: 'red'}; // dictionary: 
Map.addLayer(water, visParams, nameLayer, shown, opacity);

// Show valid points
Map.addLayer(validate.draw({color: 'ff0000', pointRadius: 5}), {},"Points",0);

// The optimal threshold is determined base on OA and Kappa coefficient showed in Console